import {
  Loader2,
  CheckCircle2,
  AlertOctagon,
  RefreshCw,
  FolderOpen,
  LogOut,
  Server,
  Cpu,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { StartupDiagnostics } from "../types.js";

interface StartupScreenProps {
  isTimeout: boolean;
  startupError: string | null;
  serverReady: boolean;
  runnerReady: boolean;
  mcpReady: boolean;
  diagnostics: StartupDiagnostics | null;
  onRetry: () => void;
  onOpenLogs: () => void;
  onQuit: () => void;
}

export const StartupScreen: React.FC<StartupScreenProps> = ({
  isTimeout,
  startupError,
  serverReady,
  runnerReady,
  mcpReady,
  diagnostics,
  onRetry,
  onOpenLogs,
  onQuit,
}) => {
  const isFailed = isTimeout || Boolean(startupError);

  const steps = [
    {
      id: "server",
      title: "Core Server",
      subtitle: "Fastify 127.0.0.1:18080",
      icon: Server,
      status: startupError
        ? "failed"
        : serverReady
        ? "ready"
        : "starting",
    },
    {
      id: "runner",
      title: "Runner",
      subtitle: "WebSocket Execution Node",
      icon: Cpu,
      status: startupError
        ? "failed"
        : runnerReady
        ? "ready"
        : serverReady
        ? "starting"
        : "waiting",
    },
    {
      id: "mcp",
      title: "MCP Tools",
      subtitle: "87 Standardized Security Tools",
      icon: ShieldCheck,
      status: startupError
        ? "failed"
        : mcpReady
        ? "ready"
        : runnerReady
        ? "starting"
        : "waiting",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070d] text-slate-100 font-sans select-none overflow-hidden p-6">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-950/20 via-transparent to-transparent" />

      <div className="relative w-full max-w-xl bg-[#090d16]/90 border border-slate-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
        {/* Nexus Branding */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <span className="font-mono font-bold text-lg text-white">N</span>
            </div>
            <div>
              <div className="font-bold text-base tracking-wide flex items-center gap-2">
                NEXUS CONTROL CENTER
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  v1.2.0
                </span>
              </div>
              <div className="text-xs text-slate-400">Production Runtime Supervisor</div>
            </div>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border ${
                isFailed
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  : "bg-sky-500/10 border-sky-500/30 text-sky-400 animate-pulse"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isFailed ? "bg-rose-400" : "bg-sky-400"
                }`}
              />
              {isFailed ? "STARTUP_FAILED" : "BOOTSTRAPPING"}
            </span>
          </div>
        </div>

        {/* Normal Loading View */}
        {!isFailed ? (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold text-white tracking-tight">
                正在启动 Nexus…
              </h2>
              <p className="text-xs text-slate-400">
                正在启动并初始化本地服务与运行时，请稍候...
              </p>
            </div>

            {/* Stepper */}
            <div className="space-y-3 bg-[#0d1322]/80 border border-slate-800/80 rounded-xl p-4">
              {steps.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/40"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          s.status === "ready"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : s.status === "starting"
                            ? "bg-sky-500/10 text-sky-400"
                            : "bg-slate-800/50 text-slate-500"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-200">
                          {s.title}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {s.subtitle}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {s.status === "ready" && (
                        <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Ready</span>
                        </div>
                      )}
                      {s.status === "starting" && (
                        <div className="flex items-center gap-1.5 text-xs font-mono text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-md border border-sky-500/20">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Starting</span>
                        </div>
                      )}
                      {s.status === "waiting" && (
                        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 bg-slate-800/40 px-2.5 py-1 rounded-md border border-slate-700/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                          <span>Waiting</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-slate-500">
              <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
              <span>Checking loopback health at http://127.0.0.1:18080/health...</span>
            </div>
          </div>
        ) : (
          /* Failure View */
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <AlertOctagon className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-rose-300">
                  Nexus 启动失败
                </h3>
                <p className="text-xs text-rose-200/80">
                  Core Server 未能就绪。
                </p>
                {startupError && (
                  <div className="text-[11px] font-mono text-rose-400 mt-2 bg-rose-950/40 p-2 rounded border border-rose-800/30 break-all">
                    {startupError}
                  </div>
                )}
              </div>
            </div>

            {/* Diagnostic Details */}
            <div className="space-y-3 bg-[#0d1322]/90 border border-slate-800/80 rounded-xl p-4 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-300 font-semibold mb-2">
                <Terminal className="w-4 h-4 text-sky-400" />
                <span>启动诊断信息 (Resource & Startup Diagnostics)</span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Resource Root:</span>
                <span className="col-span-2 text-slate-200 break-all">
                  {diagnostics?.resource_root || "未检测到 (Not Found)"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Server Exit Code:</span>
                <span className="col-span-2 text-slate-200">
                  {diagnostics?.server_exit_code !== undefined &&
                  diagnostics?.server_exit_code !== null
                    ? diagnostics.server_exit_code
                    : "None (未退出或未能启动)"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Port State:</span>
                <span className="col-span-2 text-slate-200">
                  {diagnostics?.port_state || "127.0.0.1:18080 (UNKNOWN)"}
                </span>
              </div>

              {diagnostics?.last_stderr && (
                <div className="pt-2">
                  <div className="text-slate-400 mb-1">Last stderr:</div>
                  <pre className="bg-black/60 p-2.5 rounded border border-slate-800 text-[11px] text-rose-300 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                    {diagnostics.last_stderr}
                  </pre>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-medium transition shadow-md shadow-sky-600/20"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重试</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenLogs}
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition border border-slate-700/60"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>查看日志</span>
                </button>
                <button
                  type="button"
                  onClick={onQuit}
                  className="flex items-center gap-2 px-3.5 py-2 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 rounded-lg text-xs font-medium transition border border-rose-800/40"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>退出 Nexus</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
