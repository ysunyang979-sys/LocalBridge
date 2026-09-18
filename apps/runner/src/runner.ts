import {
  PROTOCOL_VERSION,
  RunnerMethod,
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

export const RUNNER_VERSION = "0.2.0";

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

  constructor(config: RunnerDaemonConfig, logger?: Logger) {
    this.config = config;
    this.logger =
      logger ??
      createLogger({
        level: config.logging.level,
        pretty: config.logging.pretty,
      });

    this.runnerId =
      config.runnerId || getOrCreateRunnerId(config.statePath);

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
        this.logger.warn("Heartbeat monitor detected dead connection, terminating socket");
        this.client?.terminate();
      },
      logger: this.logger,
    });
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
      RunnerMethod.RUNNER_HELLO,
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
