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
import fs from "node:fs";
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
import { createGitInfoHandler } from "./rpc/handlers/git-info.js";
import { createGitStatusHandler } from "./rpc/handlers/git-status.js";
import { createGitDiffHandler } from "./rpc/handlers/git-diff.js";
import { createGitLogHandler } from "./rpc/handlers/git-log.js";
import { createGitStageHandler } from "./rpc/handlers/git-stage.js";
import { createGitUnstageHandler } from "./rpc/handlers/git-unstage.js";
import { createGitBranchCreateHandler } from "./rpc/handlers/git-branch-create.js";
import { createGitBranchSwitchHandler } from "./rpc/handlers/git-branch-switch.js";
import { createGitCommitHandler } from "./rpc/handlers/git-commit.js";
import { createCommandClassifyHandler } from "./rpc/handlers/command-classify.js";
import { createCommandRunHandler } from "./rpc/handlers/command-run.js";
import { createJobStartHandler } from "./rpc/handlers/job-start.js";
import { createJobStatusHandler } from "./rpc/handlers/job-status.js";
import { createJobLogsHandler } from "./rpc/handlers/job-logs.js";
import { createJobCancelHandler } from "./rpc/handlers/job-cancel.js";
import { createJobCancelAllHandler } from "./rpc/handlers/job-cancel-all.js";
import { createJobListHandler } from "./rpc/handlers/job-list.js";
import { createBuildStartHandler } from "./rpc/handlers/build-start.js";
import { createTestStartHandler } from "./rpc/handlers/test-start.js";
import { createProjectAuthorizeHandler } from "./rpc/handlers/project-authorize.js";
import { createProjectSetAccessHandler } from "./rpc/handlers/project-set-access.js";
import { createProjectSetExecutionHandler } from "./rpc/handlers/project-set-execution.js";
import { createProjectRemoveHandler } from "./rpc/handlers/project-remove.js";
import { createProjectEnableHandler } from "./rpc/handlers/project-enable.js";
import { createProjectDisableHandler } from "./rpc/handlers/project-disable.js";
import { createApprovalCreateHandler } from "./rpc/handlers/approval-create.js";
import { createApprovalResolveHandler } from "./rpc/handlers/approval-resolve.js";
import { createApprovalListHandler } from "./rpc/handlers/approval-list.js";
import { createApprovalGetHandler } from "./rpc/handlers/approval-get.js";
import { createApprovalBulkResolveHandler } from "./rpc/handlers/approval-bulk-resolve.js";
import { createProjectSetTrustPolicyHandler } from "./rpc/handlers/project-set-trust-policy.js";
import { createProjectSessionTrustHandler } from "./rpc/handlers/project-session-trust.js";
import { ApprovalManager } from "./approvals/index.js";
import { ProjectRegistry } from "./projects/index.js";
import { FilesystemService } from "./filesystem/index.js";
import { BackupService } from "./backup/index.js";
import { GitService } from "./git/index.js";
import {
  CommandExecutionService,
  ExecutableRegistry,
  ProcessRunner,
} from "./process/index.js";
import { JobManager } from "./jobs/index.js";
import { LspManager } from "./lsp/index.js";
import { createCodeDocumentSymbolsHandler } from "./rpc/handlers/code-document-symbols.js";
import { createCodeWorkspaceSymbolsHandler } from "./rpc/handlers/code-workspace-symbols.js";
import { createCodeDefinitionHandler } from "./rpc/handlers/code-definition.js";
import { createCodeReferencesHandler } from "./rpc/handlers/code-references.js";
import { createCodeHoverHandler } from "./rpc/handlers/code-hover.js";
import { createCodeDiagnosticsHandler } from "./rpc/handlers/code-diagnostics.js";
import { createCodeCallHierarchyHandler } from "./rpc/handlers/code-call-hierarchy.js";
import { createCodeImpactHandler } from "./rpc/handlers/code-impact.js";
import { createLspStatusHandler } from "./rpc/handlers/lsp-status.js";
import { createLspRestartHandler } from "./rpc/handlers/lsp-restart.js";
import { createLspStopHandler } from "./rpc/handlers/lsp-stop.js";

export const RUNNER_VERSION = "1.1.0";

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
  readonly gitService: GitService;
  readonly executableRegistry: ExecutableRegistry;
  readonly processRunner: ProcessRunner;
  readonly commandExecutionService: CommandExecutionService;
  readonly jobManager: JobManager;
  readonly approvalManager: ApprovalManager;
  readonly lspManager: LspManager;
  readonly runnerStateDir: string;

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

    const runnerStateDir =
      config.statePath
        ? path.dirname(config.statePath)
        : path.join(os.homedir(), ".localbridge");
    this.runnerStateDir = runnerStateDir;

    const projectsPath =
      config.projectsPath ||
      path.join(runnerStateDir, "projects.json");

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

    this.gitService = new GitService(
      this.projectRegistry,
      this.logger
    );

    this.executableRegistry = new ExecutableRegistry(this.logger);
    this.processRunner = new ProcessRunner(this.logger);
    this.approvalManager = new ApprovalManager(this.logger);

    this.commandExecutionService = new CommandExecutionService(
      this.projectRegistry,
      this.executableRegistry,
      this.processRunner,
      runnerStateDir,
      this.logger,
      this.approvalManager
    );

    this.jobManager = new JobManager(
      this.projectRegistry,
      this.executableRegistry,
      runnerStateDir,
      this.logger,
      this.approvalManager,
      { enableQueue: true, persistState: true }
    );

    this.lspManager = new LspManager(
      this.projectRegistry,
      runnerStateDir,
      this.logger
    );

    this.filesystemService.onFileChange((projectId, path, content) => {
      this.lspManager.onFileModified(projectId, path, content).catch(() => {});
    });

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

    this.rpcRouter.register(RunnerRpcMethods.SystemShutdown, async () => {
      setTimeout(() => { void this.stop(); }, 50);
      return { accepted: true as const };
    });

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
      createFileStatHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileRead,
      createFileReadHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileCreate,
      createFileCreateHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileWrite,
      createFileWriteHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FilePatch,
      createFilePatchHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileDelete,
      createFileDeleteHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileRestore,
      createFileRestoreHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitInfo,
      createGitInfoHandler(this.gitService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitStatus,
      createGitStatusHandler(this.gitService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitDiff,
      createGitDiffHandler(this.gitService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitLog,
      createGitLogHandler(this.gitService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitStage,
      createGitStageHandler(this.gitService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitUnstage,
      createGitUnstageHandler(this.gitService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitBranchCreate,
      createGitBranchCreateHandler(this.gitService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitBranchSwitch,
      createGitBranchSwitchHandler(this.gitService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitCommit,
      createGitCommitHandler(this.gitService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CommandClassify,
      createCommandClassifyHandler(this.commandExecutionService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CommandRun,
      createCommandRunHandler(this.commandExecutionService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobStart,
      createJobStartHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobStatus,
      createJobStatusHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobLogs,
      createJobLogsHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobCancel,
      createJobCancelHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobList,
      createJobListHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.BuildStart,
      createBuildStartHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.TestStart,
      createTestStartHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectAuthorize,
      createProjectAuthorizeHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectSetAccess,
      createProjectSetAccessHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectSetExecution,
      createProjectSetExecutionHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectRemove,
      createProjectRemoveHandler(this.projectRegistry, this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectEnable,
      createProjectEnableHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectDisable,
      createProjectDisableHandler(this.projectRegistry, this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalCreate,
      createApprovalCreateHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalResolve,
      createApprovalResolveHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalList,
      createApprovalListHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalGet,
      createApprovalGetHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalBulkResolve,
      createApprovalBulkResolveHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectSetTrustPolicy,
      createProjectSetTrustPolicyHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectSessionTrust,
      createProjectSessionTrustHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobCancelAll,
      createJobCancelAllHandler(this.jobManager, this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeDocumentSymbols,
      createCodeDocumentSymbolsHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeWorkspaceSymbols,
      createCodeWorkspaceSymbolsHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeDefinition,
      createCodeDefinitionHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeReferences,
      createCodeReferencesHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeHover,
      createCodeHoverHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeDiagnostics,
      createCodeDiagnosticsHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeCallHierarchy,
      createCodeCallHierarchyHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeImpact,
      createCodeImpactHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.LspStatus,
      createLspStatusHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.LspRestart,
      createLspRestartHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.LspStop,
      createLspStopHandler(this.lspManager)
    );
  }

  get router(): RpcRouter {
    return this.rpcRouter;
  }

  /**
   * Safe cleanup of orphaned LocalBridge temporary files from previous crashed runs.
   * Strictly targets files matching the LocalBridge atomic write pattern:
   * (e.g. `.*.localbridge-[0-9a-f]{16}.tmp` or `.localbridge-*.tmp`).
   * Never deletes ordinary user files.
   */
  private cleanOrphanedTempFiles(): void {
    const isLocalBridgeTempFile = (filename: string): boolean => {
      return (
        /^\..*\.localbridge-[0-9a-f]+\.tmp$/i.test(filename) ||
        /^\.localbridge-.*\.tmp$/i.test(filename)
      );
    };

    const cleanDirectory = (dirPath: string): void => {
      if (!fs.existsSync(dirPath)) return;
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && isLocalBridgeTempFile(entry.name)) {
            const filePath = path.join(dirPath, entry.name);
            try {
              fs.unlinkSync(filePath);
              this.logger.debug(
                { file: entry.name, dir: dirPath },
                "Cleaned up orphaned LocalBridge temp file"
              );
            } catch (e) {
              this.logger.warn(
                { file: entry.name, error: String(e) },
                "Failed to delete temp file"
              );
            }
          }
        }
      } catch (e) {
        this.logger.warn(
          { dir: dirPath, error: String(e) },
          "Failed to scan directory for temp files"
        );
      }
    };

    cleanDirectory(this.runnerStateDir);
    for (const project of this.projectRegistry.list()) {
      cleanDirectory(project.canonicalRoot);
    }
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

    // Phase 12 Security Hardening: Startup cleanups
    this.backupService.cleanupAllProjects();
    this.cleanOrphanedTempFiles();

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
    await this.jobManager.stop();
    await this.lspManager.stopAll();
    this.approvalManager.expireAll();

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
