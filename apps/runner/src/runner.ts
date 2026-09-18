import {
  PROTOCOL_VERSION,
  RunnerRpcMethods,
  type RunnerCapabilities,
  type RunnerSystemInfo,
  type RunnerHelloResponse,
  type RunnerHelloRequestParams,
} from "@localbridge/protocol";
import { createLogger, type Logger } from "@localbridge/shared";
import type { RunnerDaemonConfig } from "./config/schema.js";
import { getOrCreateRunnerId } from "./system/runner-id.js";
import { collectSystemInfo } from "./system/info.js";
import { detectCapabilities } from "./system/capabilities.js";
import { ReconnectController } from "./client/reconnect.js";
import { HeartbeatMonitor } from "./client/heartbeat.js";
import { RunnerWsClient } from "./client/websocket.js";
import os from "node:os";
import path from "node:path";
import { RpcRouter } from "./rpc/router.js";
import { createSystemPingHandler } from "./rpc/handlers/system-ping.js";
import { createSystemInfoHandler } from "./rpc/handlers/system-info.js";
import { createProjectListHandler } from "./rpc/handlers/project-list.js";
import { createProjectInfoHandler } from "./rpc/handlers/project-info.js";
import { createProjectValidateHandler } from "./rpc/handlers/project-validate.js";
import { createDirectoryListHandler } from "./rpc/handlers/directory-list.js";
import { createFileStatHandler } from "./rpc/handlers/file-stat.js";
import { createFileReadHandler } from "./rpc/handlers/file-read.js";
import { createFileCreateHandler } from "./rpc/handlers/file-create.js";
import { createFileWriteHandler } from "./rpc/handlers/file-write.js";
import { createFilePatchHandler } from "./rpc/handlers/file-patch.js";
import { createFileDeleteHandler } from "./rpc/handlers/file-delete.js";
import { createFileRestoreHandler } from "./rpc/handlers/file-restore.js";
import { ProjectRegistry } from "./projects/index.js";
import { FilesystemService } from "./filesystem/index.js";
import { BackupService } from "./backup/index.js";

export const RUNNER_VERSION = "0.6.0";

export type RunnerLifecycleState = "idle" | "connecting" | "handshaking" | "online" | "reconnecting" | "stopped";

export class LocalBridgeRunner {
  private client: RunnerWsClient | null = null;
  private reconnectController: ReconnectController;
  private heartbeatMonitor: HeartbeatMonitor;
  private logger: Logger;
  private state: RunnerLifecycleState = "idle";
  private stopping = false;
  readonly runnerId: string;
  readonly config: RunnerDaemonConfig;
  readonly rpcRouter: RpcRouter;
  readonly projectRegistry: ProjectRegistry;
  readonly backupService: BackupService;
  readonly filesystemService: FilesystemService;

  constructor(config: RunnerDaemonConfig, logger?: Logger) {
    this.config = config;
    this.logger =
      logger ??
      createLogger({
        level: config.logging.level,
        pretty: config.logging.pretty,
      });

    this.runnerId =
      config.runnerId ||
      getOrCreateRunnerId(config.statePath);

    const projectsPath =
      config.projectsPath ||
      (config.statePath
        ? path.join(path.dirname(config.statePath), "projects.json")
        : path.join(os.homedir(), ".localbridge", "projects.json"));

    this.projectRegistry = new ProjectRegistry(projectsPath, this.logger);

    const backupDir =
      config.statePath
        ? path.join(path.dirname(config.statePath), "backups")
        : path.join(os.homedir(), ".localbridge", "backups");

    this.backupService = new BackupService(backupDir, this.logger);

    this.reconnectController = new ReconnectController({
      enabled: config.reconnect.enabled,
      initialDelayMs: config.reconnect.initialDelayMs,
      maxDelayMs: config.reconnect.maxDelayMs,
      factor: config.reconnect.factor,
      jitter: config.reconnect.jitter,
    });

    this.heartbeatMonitor = new HeartbeatMonitor({
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      onDeadConnection: () => {
        this.logger.warn("Heartbeat timeout detected; terminating runner connection");
        this.client?.terminate();
      },
      logger: this.logger,
    });

    this.filesystemService = new FilesystemService(
      this.projectRegistry,
      this.backupService,
      this.logger
    );

    this.rpcRouter = new RpcRouter(this.logger);
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    const systemInfo: RunnerSystemInfo = collectSystemInfo();
    const capabilities: RunnerCapabilities = detectCapabilities(systemInfo.tools);

    this.rpcRouter.register(
      RunnerRpcMethods.SystemPing,
      createSystemPingHandler({ runnerId: this.runnerId })
    );

    this.rpcRouter.register(
      RunnerRpcMethods.SystemInfo,
      createSystemInfoHandler({
        runnerId: this.runnerId,
        version: RUNNER_VERSION,
        capabilities,
        tools: systemInfo.tools,
      })
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectList,
      createProjectListHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectInfo,
      createProjectInfoHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectValidate,
      createProjectValidateHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.DirectoryList,
      createDirectoryListHandler(this.filesystemService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileStat,
      createFileStatHandler(this.filesystemService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileRead,
      createFileReadHandler(this.filesystemService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileCreate,
      createFileCreateHandler(this.filesystemService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileWrite,
      createFileWriteHandler(this.filesystemService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FilePatch,
      createFilePatchHandler(this.filesystemService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileDelete,
      createFileDeleteHandler(this.filesystemService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileRestore,
      createFileRestoreHandler(this.filesystemService)
    );
  }

  get router(): RpcRouter {
    return this.rpcRouter;
  }

  /**
   * Start the Runner daemon and initiate connection to LocalBridge Server.
   */
  async start(): Promise<void> {
    this.stopping = false;
    this.logger.info(
      {
        runnerId: this.runnerId,
        runnerName: this.config.runnerName,
        serverUrl: this.config.serverUrl,
        version: RUNNER_VERSION,
      },
      "Starting LocalBridge Runner daemon..."
    );

    await this.connect();
  }

  /**
   * Stop the Runner daemon gracefully.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    this.state = "stopped";
    this.reconnectController.cancel();
    this.heartbeatMonitor.stop();

    if (this.client) {
      this.logger.info("Closing WebSocket connection to server...");
      this.client.close(1000, "runner_shutdown");
      this.client = null;
    }

    this.logger.info("LocalBridge Runner stopped gracefully.");
  }

  get currentState(): RunnerLifecycleState {
    return this.state;
  }

  get isOnline(): boolean {
    return this.state === "online";
  }

  private async connect(): Promise<void> {
    if (this.stopping) return;

    this.state = "connecting";
    this.logger.info(
      { serverUrl: this.config.serverUrl, attempt: this.reconnectController.currentAttempts },
      "Connecting to LocalBridge Server..."
    );

    this.client = new RunnerWsClient({
      serverUrl: this.config.serverUrl,
      token: this.config.token,
      logger: this.logger,
      onOpen: () => {
        this.logger.info("WebSocket connected, initiating handshake...");
      },
      onClose: (code, reason) => {
        this.handleDisconnect(code, reason);
      },
      onError: (err) => {
        this.logger.warn({ err: err.message }, "WebSocket connection error");
      },
      onMessage: async (data) => {
        const response = await this.rpcRouter.handle(data as string | Buffer);
        if (response && this.client) {
          this.client.send(JSON.stringify(response));
        }
      },
    });

    try {
      await this.client.connect();
      await this.performHandshake();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn({ error: msg }, "Failed to connect or handshake with server");
      this.handleDisconnect(-1, msg);
    }
  }

  private async performHandshake(): Promise<void> {
    if (!this.client || this.stopping) return;

    this.state = "handshaking";
    const systemInfo: RunnerSystemInfo = collectSystemInfo();
    const capabilities: RunnerCapabilities = detectCapabilities(systemInfo.tools);

    const helloParams: RunnerHelloRequestParams = {
      protocolVersion: PROTOCOL_VERSION,
      runnerId: this.runnerId,
      runnerVersion: RUNNER_VERSION,
      name: this.config.runnerName,
      system: systemInfo,
      capabilities,
    };

    this.logger.info(
      {
        runnerId: this.runnerId,
        protocolVersion: PROTOCOL_VERSION,
        tools: systemInfo.tools,
        capabilities,
      },
      "Sending runner.hello handshake..."
    );

    const result = await this.client.call<RunnerHelloResponse>(
      RunnerRpcMethods.Hello,
      helloParams,
      8000
    );

    if (result && result.accepted) {
      this.state = "online";
      this.reconnectController.reset();

      if (this.client.rawSocket) {
        this.heartbeatMonitor.start(this.client.rawSocket);
      }

      this.logger.info(
        {
          serverVersion: result.serverVersion,
          protocolVersion: result.protocolVersion,
          heartbeatIntervalMs: result.heartbeatIntervalMs,
        },
        "Handshake accepted! LocalBridge Runner is ONLINE"
      );
    } else {
      throw new Error("Handshake was not accepted by server");
    }
  }

  private handleDisconnect(code: number, reason: string): void {
    this.heartbeatMonitor.stop();

    if (this.stopping) {
      this.state = "stopped";
      return;
    }

    this.state = "reconnecting";
    this.logger.warn(
      { code, reason },
      "Runner disconnected from server"
    );

    if (this.config.reconnect.enabled) {
      const delay = this.reconnectController.schedule(() => {
        this.connect().catch((err) => {
          this.logger.error(err, "Reconnection attempt encountered error");
        });
      });

      if (delay !== null) {
        this.logger.info(
          { delayMs: delay, nextAttempt: this.reconnectController.currentAttempts },
          `Reconnecting in ${Math.round(delay / 1000)}s...`
        );
      }
    }
  }
}
