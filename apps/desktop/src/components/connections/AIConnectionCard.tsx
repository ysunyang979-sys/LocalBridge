import React from "react";
import {
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Radio,
  FileCode,
  Terminal,
  Cpu,
  Star,
  RefreshCw,
  Settings,
} from "lucide-react";
import type { AIConnectionDto } from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface AIConnectionCardProps {
  connection: AIConnectionDto;
  isPrimary: boolean;
  onSetPrimary: (id: string) => void;
  onTest: (id: string) => void;
  onOpenDetails: (conn: AIConnectionDto) => void;
  onApplyConfig?: (conn: AIConnectionDto) => void;
  isTesting?: boolean;
  isApplying?: boolean;
}

export const AIConnectionCard: React.FC<AIConnectionCardProps> = ({
  connection,
  isPrimary,
  onSetPrimary,
  onTest,
  onOpenDetails,
  onApplyConfig,
  isTesting,
  isApplying,
}) => {
  const { t } = useTranslation();

  const getClientIcon = (clientType: string) => {
    switch (clientType) {
      case "chatgpt":
        return <Radio className="w-5 h-5 text-emerald-500" />;
      case "kimi":
        return <Sparkles className="w-5 h-5 text-indigo-400" />;
      case "claude":
        return <Zap className="w-5 h-5 text-amber-500" />;
      case "gemini":
        return <Terminal className="w-5 h-5 text-sky-400" />;
      case "deepseek":
        return <Cpu className="w-5 h-5 text-blue-500" />;
      default:
        return <FileCode className="w-5 h-5 text-cyan-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t.aiConnections?.statusConnected || "Connected"}
          </span>
        );
      case "configured":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <CheckCircle2 className="w-3 h-3" />
            {t.aiConnections?.statusConfigured || "Configured"}
          </span>
        );
      case "connecting":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {t.aiConnections?.statusConnecting || "Connecting"}
          </span>
        );
      case "offline":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/20">
            <Clock className="w-3 h-3" />
            {t.aiConnections?.statusOffline || "Offline"}
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
            <AlertCircle className="w-3 h-3" />
            {t.aiConnections?.statusError || "Error"}
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            {t.aiConnections?.statusNotConfigured || "Not Configured"}
          </span>
        );
    }
  };

  const isNativeMcp = connection.category === "native-mcp";

  return (
    <div
      className={`relative p-5 rounded-xl border transition-all duration-200 bg-theme-card flex flex-col justify-between shadow-sm ${
        isPrimary
          ? "border-sky-500/40 ring-1 ring-sky-500/20"
          : "border-theme-subtle hover:border-theme-hover"
      }`}
    >
      {/* Top row: Avatar, Titles, Badges */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-theme-card-muted border border-theme-subtle shrink-0">
              {getClientIcon(connection.clientType)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-theme-primary truncate">
                  {connection.name}
                </h3>
                {isPrimary && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                    {t.aiConnections?.isPrimary || "Primary"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {/* Category Badge */}
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    isNativeMcp
                      ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30"
                      : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                  }`}
                  title={
                    isNativeMcp
                      ? (t.aiConnections?.categoryDescNativeMcp || "Native MCP Protocol")
                      : (t.aiConnections?.categoryDescToolAdapter || "Tool/API Adapter (Function Calling)")
                  }
                >
                  {isNativeMcp
                    ? (t.aiConnections?.categoryNativeMcp || "Native MCP")
                    : (t.aiConnections?.categoryToolAdapter || "Tool/API Adapter")}
                </span>

                {/* Transport Badge */}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-theme-card-muted text-theme-secondary border border-theme-subtle">
                  {connection.transport === "tunnel"
                    ? (t.aiConnections?.transportTunnel || "Secure Tunnel")
                    : connection.transport === "streamable-http"
                    ? (t.aiConnections?.transportStreamableHttp || "Streamable HTTP")
                    : connection.transport === "http"
                    ? (t.aiConnections?.transportHttp || "HTTP")
                    : connection.transport}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0">{getStatusBadge(connection.status)}</div>
        </div>

        {/* Description or detected path */}
        <div className="space-y-1.5 my-3 text-xs">
          {connection.detectedConfigPath ? (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] truncate">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate" title={connection.detectedConfigPath}>
                {t.aiConnections?.configDetected || "Detected"}: {connection.detectedConfigPath}
              </span>
            </div>
          ) : isNativeMcp && connection.clientType !== "chatgpt" ? (
            <div className="text-[11px] text-theme-muted truncate font-mono">
              {t.aiConnections?.configNotFound || "Config file not found"}
            </div>
          ) : null}

          {/* Model info for Tool/API adapters */}
          {Boolean(connection.metadata?.model) && (
            <div className="text-[11px] text-theme-secondary font-mono">
              <span className="text-theme-muted">Model: </span>
              <span className="font-semibold text-theme-primary">{String(connection.metadata?.model)}</span>
            </div>
          )}

          {/* Endpoint */}
          {connection.endpoint && (
            <div className="text-[11px] text-theme-muted font-mono truncate">
              <span>Endpoint: </span>
              <span className="text-theme-secondary">{connection.endpoint}</span>
            </div>
          )}
        </div>

        {/* Metrics Row: Tools count, scopes, latency */}
        <div className="grid grid-cols-3 gap-2 py-2 border-t border-theme-subtle text-[11px] font-mono">
          <div>
            <div className="text-theme-muted">{t.aiConnections?.toolsCount || "Tools"}</div>
            <div className="font-bold text-theme-primary mt-0.5">
              {connection.toolCount || 24}
            </div>
          </div>
          <div>
            <div className="text-theme-muted">{t.aiConnections?.scopesLabel || "Scopes"}</div>
            <div className="text-theme-secondary mt-0.5 truncate" title={connection.scopes?.join(", ")}>
              {connection.scopes?.join(", ") || "read, write"}
            </div>
          </div>
          <div>
            <div className="text-theme-muted">{t.aiConnections?.latencyLabel || "Latency"}</div>
            <div className="text-theme-secondary mt-0.5">
              {connection.latencyMs !== undefined ? `${connection.latencyMs} ms` : "--"}
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-theme-subtle flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {!isPrimary && (
            <button
              onClick={() => onSetPrimary(connection.id)}
              className="text-[11px] px-2 py-1 rounded text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover transition"
              title={t.aiConnections?.setAsPrimary || "Set as Primary AI"}
            >
              {t.aiConnections?.setAsPrimary || "Set as Primary"}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Apply Config Button if client config detected */}
          {isNativeMcp && connection.clientType !== "chatgpt" && onApplyConfig && (
            <button
              onClick={() => onApplyConfig(connection)}
              disabled={isApplying}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 transition disabled:opacity-50"
              title={t.aiConnections?.applyConfig || "Apply Config"}
            >
              {isApplying
                ? (t.aiConnections?.applyingConfig || "...")
                : (t.aiConnections?.applyConfig || "Apply Config")}
            </button>
          )}

          {/* Test Button */}
          <button
            onClick={() => onTest(connection.id)}
            disabled={isTesting}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition disabled:opacity-50 flex items-center gap-1"
            title={t.aiConnections?.testConnection || "Test Connection"}
          >
            {isTesting && <RefreshCw className="w-3 h-3 animate-spin text-sky-500" />}
            <span>{isTesting ? (t.aiConnections?.testingConnection || "...") : (t.aiConnections?.testConnection || "Test")}</span>
          </button>

          {/* Details & Config Drawer Trigger */}
          <button
            onClick={() => onOpenDetails(connection)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-theme-primary text-theme-inverse hover:opacity-90 transition flex items-center gap-1 shadow-sm"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{t.aiConnections?.viewDetails || "Details"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
