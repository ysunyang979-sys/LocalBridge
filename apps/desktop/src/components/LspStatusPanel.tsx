import React, { useState, useEffect, useCallback } from "react";
import { Code2, RotateCcw, Square, AlertTriangle, Loader2 } from "lucide-react";
import { bridge } from "../api/bridge.js";
import type { LspServerStatus } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface LspStatusPanelProps {
  projectId: string;
  projectName?: string;
  enabled: boolean;
}

export const LspStatusPanel: React.FC<LspStatusPanelProps> = ({
  projectId,
  enabled,
}) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LspServerStatus | null>(null);
  const [actionInProgress, setActionInProgress] = useState<"restart" | "stop" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    try {
      const res = await bridge.getLspStatus(projectId);
      if (res && res.servers && res.servers.length > 0) {
        setStatus(res.servers[0]);
      } else {
        setStatus(null);
      }
      setErrorMsg(null);
    } catch (_err: any) {
      // Don't treat 404/not running as critical UI error
      setStatus(null);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRestart = async () => {
    setActionInProgress("restart");
    setErrorMsg(null);
    try {
      const res = await bridge.restartLspServer(projectId);
      setStatus(res.status);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to restart LSP server");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStop = async () => {
    setActionInProgress("stop");
    setErrorMsg(null);
    try {
      await bridge.stopLspServer(projectId);
      setStatus(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to stop LSP server");
    } finally {
      setActionInProgress(null);
    }
  };

  if (!enabled) {
    return null;
  }

  const serverStatus = status?.status || "stopped";
  const badgeClass =
    serverStatus === "ready"
      ? "badge-green"
      : serverStatus === "starting"
        ? "badge-blue"
        : serverStatus === "error"
          ? "badge-red"
          : "badge-gray";

  const statusLabel =
    serverStatus === "ready"
      ? (t.lsp?.ready || "Ready")
      : serverStatus === "starting"
        ? (t.lsp?.starting || "Starting")
        : serverStatus === "error"
          ? (t.lsp?.error || "Error")
          : (t.lsp?.stopped || "Stopped");

  return (
    <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle space-y-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="font-semibold text-theme-primary truncate">
            {t.lsp?.title || "Code Intelligence (LSP)"}
          </span>
          <span className="text-[11px] text-theme-muted font-mono">
            {t.lsp?.language || "Language"}: TypeScript / JavaScript
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`badge ${badgeClass}`}>{statusLabel}</span>

          {status?.pid && (
            <span className="text-[11px] font-mono text-theme-muted">
              PID: {status.pid}
            </span>
          )}

          <span className="text-[11px] font-mono text-theme-muted">
            {t.lsp?.restartCount || "Restarts"}: {status?.restartCount || 0}
          </span>

          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={handleRestart}
              disabled={actionInProgress !== null}
              title={t.lsp?.restartBtn || "Restart LSP Server"}
              className="p-1 rounded hover:bg-theme-card-hover text-theme-secondary hover:text-indigo-400 transition disabled:opacity-50"
            >
              {actionInProgress === "restart" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
            </button>

            {serverStatus !== "stopped" && serverStatus !== "unavailable" && (
              <button
                onClick={handleStop}
                disabled={actionInProgress !== null}
                title={t.lsp?.stopBtn || "Stop LSP Server"}
                className="p-1 rounded hover:bg-theme-card-hover text-theme-secondary hover:text-red-400 transition disabled:opacity-50"
              >
                {actionInProgress === "stop" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {status?.lastError && (
        <div className="text-[11px] text-red-400 bg-red-500/10 p-1.5 rounded flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
          <span className="truncate">{status.lastError}</span>
        </div>
      )}

      {errorMsg && (
        <div className="text-[11px] text-red-400 bg-red-500/10 p-1.5 rounded flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
          <span className="truncate">{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
