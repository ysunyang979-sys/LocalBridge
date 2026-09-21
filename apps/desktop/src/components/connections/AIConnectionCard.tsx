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
  ExternalLink,
} from "lucide-react";
import type { AIConnectionDto } from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface AIConnectionCardProps {
  connection: AIConnectionDto;
  isPrimary: boolean;
  mode?: "standard" | "advanced";
  onSetPrimary: (id: string) => void;
  onTest: (id: string) => void;
  onOpenDetails: (conn: AIConnectionDto) => void;
  onApplyConfig?: (conn: AIConnectionDto) => void;
  onOpenTunnel?: () => void;
  isTesting?: boolean;
  isApplying?: boolean;
}

export const AIConnectionCard: React.FC<AIConnectionCardProps> = ({
  connection,
  isPrimary,
  mode = "standard",
  onSetPrimary,
  onTest,
  onOpenDetails,
  onApplyConfig,
  onOpenTunnel,
  isTesting,
  isApplying,
}) => {
  const { t, language } = useTranslation();
  const isZh = language === "zh-CN";

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
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t.aiConnections?.statusConnected || "已连接"}
          </span>
        );
      case "configured":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30">
            <CheckCircle2 className="w-3 h-3" />
            {t.aiConnections?.statusConfigured || "已配置"}
          </span>
        );
      case "connecting":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {t.aiConnections?.statusConnecting || "连接中"}
          </span>
        );
      case "offline":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/30">
            <Clock className="w-3 h-3" />
            {t.aiConnections?.statusOffline || "离线"}
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
            <AlertCircle className="w-3 h-3" />
            {t.aiConnections?.statusError || "异常"}
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/30">
            {t.aiConnections?.statusNotConfigured || "未配置"}
          </span>
        );
    }
  };

  const isNativeMcp = connection.category === "native-mcp";
  const isConnected = connection.status === "connected";
  const isChatGPT = connection.clientType === "chatgpt";

  // Built-in descriptions
  const getDefaultDescription = () => {
    switch (connection.clientType) {
      case "chatgpt":
        return isZh
          ? "通过 Secure MCP Tunnel 安全连接到 ChatGPT"
          : "Direct connection to ChatGPT via Secure MCP Tunnel";
      case "kimi":
        return isZh
          ? "原生 MCP 客户端，通过 ~/.kimi-code/mcp.json 快速接入"
          : "Native MCP client connecting via ~/.kimi-code/mcp.json";
      case "claude":
        return isZh
          ? "支持 Claude Desktop 与 Claude Code CLI 原生协议直连"
          : "Supports Claude Desktop & Claude Code via native MCP protocol";
      case "gemini":
        return isZh
          ? "Google Gemini 命令行工具，通过本地 settings.json 建立连接"
          : "Google Gemini CLI via local settings.json configuration";
      case "deepseek":
        return isZh
          ? "标准 Function Calling 工具适配器，受本地控制面保护"
          : "Standard Function Calling tool adapter governed by Nexus";
      case "custom-openai":
        return isZh
          ? "兼容 OpenAI 格式的第三方商用或本地 Ollama/vLLM 模型端点"
          : "OpenAI-compatible endpoint for commercial or local Ollama models";
      default:
        return isNativeMcp
          ? (isZh ? "自定义 Native MCP 客户端连接" : "Custom Native MCP client connection")
          : (isZh ? "自定义 API 模型与工具适配器" : "Custom API model & tool adapter");
    }
  };

  return (
    <div
      className={`relative p-4 rounded-xl border transition-all duration-200 bg-theme-card flex flex-col justify-between shadow-sm ${
        isPrimary
          ? "border-sky-500/50 ring-1 ring-sky-500/20"
          : "border-theme-subtle hover:border-theme-hover"
      }`}
    >
      {/* Top row: Avatar, Titles, Badges */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-theme-card-muted border border-theme-subtle shrink-0">
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
                    {t.aiConnections?.isPrimary || "首选"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {/* Category Badge */}
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    isNativeMcp
                      ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30"
                      : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                  }`}
                >
                  {isNativeMcp
                    ? (t.aiConnections?.categoryNativeMcp || "Native MCP")
                    : (t.aiConnections?.categoryToolAdapter || "Tool/API 适配器")}
                </span>

                {/* Transport Badge (shown in advanced mode or standard tunnel) */}
                {(mode === "advanced" || connection.transport === "tunnel") && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-theme-card-muted text-theme-secondary border border-theme-subtle">
                    {connection.transport === "tunnel"
                      ? (t.aiConnections?.transportTunnel || "Secure Tunnel")
                      : connection.transport === "streamable-http"
                      ? (t.aiConnections?.transportStreamableHttp || "Streamable HTTP")
                      : connection.transport === "http"
                      ? (t.aiConnections?.transportHttp || "HTTP")
                      : connection.transport}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0">{getStatusBadge(connection.status)}</div>
        </div>

        {/* 1-Line Description */}
        <p className="text-xs text-theme-muted my-2 line-clamp-2 leading-relaxed">
          {getDefaultDescription()}
        </p>

        {/* Advanced Technical Details */}
        {mode === "advanced" && (
          <div className="space-y-1.5 my-2.5 pt-2 border-t border-theme-subtle text-xs">
            {connection.detectedConfigPath ? (
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] truncate">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate" title={connection.detectedConfigPath}>
                  {t.aiConnections?.configDetected || "已检测配置"}: {connection.detectedConfigPath}
                </span>
              </div>
            ) : isNativeMcp && connection.clientType !== "chatgpt" ? (
              <div className="text-[11px] text-theme-muted truncate font-mono">
                {t.aiConnections?.configNotFound || "未检测到本地配置文件"}
              </div>
            ) : null}

            {Boolean(connection.metadata?.model) && (
              <div className="text-[11px] text-theme-secondary font-mono truncate">
                <span className="text-theme-muted">Model: </span>
                <span className="font-semibold text-theme-primary">{String(connection.metadata?.model)}</span>
              </div>
            )}

            {connection.endpoint && (
              <div className="text-[11px] text-theme-muted font-mono truncate">
                <span>Endpoint: </span>
                <span className="text-theme-secondary">{connection.endpoint}</span>
              </div>
            )}

            {/* Metrics Row: Tools, scopes, latency */}
            <div className="grid grid-cols-3 gap-2 py-2 mt-2 border-t border-theme-subtle text-[11px] font-mono">
              <div>
                <div className="text-theme-muted">{t.aiConnections?.toolsCount || "工具数"}</div>
                <div className="font-bold text-theme-primary mt-0.5">
                  {connection.toolCount || 55}
                </div>
              </div>
              <div>
                <div className="text-theme-muted">{t.aiConnections?.scopesLabel || "权限"}</div>
                <div className="text-theme-secondary mt-0.5 truncate" title={connection.scopes?.join(", ")}>
                  {connection.scopes?.join(", ") || "read, write"}
                </div>
              </div>
              <div>
                <div className="text-theme-muted">{t.aiConnections?.latencyLabel || "延迟"}</div>
                <div className="text-theme-secondary mt-0.5">
                  {connection.latencyMs !== undefined && connection.latencyMs !== null ? `${connection.latencyMs} ms` : "--"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-theme-subtle flex items-center justify-between gap-2 mt-2">
        <div className="flex items-center gap-1.5">
          {!isPrimary && (
            <button
              onClick={() => onSetPrimary(connection.id)}
              className="text-[11px] px-2 py-1 rounded text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover transition"
              title={t.aiConnections?.setAsPrimary || "设为主 AI"}
            >
              {t.aiConnections?.setAsPrimary || "设为首选"}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Tunnel Action for ChatGPT */}
          {isChatGPT && !isConnected && onOpenTunnel && (
            <button
              onClick={onOpenTunnel}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 transition flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              <span>{t.aiConnections?.openTunnel || "前往隧道"}</span>
            </button>
          )}

          {/* Quick Apply Config Button for Native MCP */}
          {isNativeMcp && !isChatGPT && onApplyConfig && connection.status !== "connected" && (
            <button
              onClick={() => onApplyConfig(connection)}
              disabled={isApplying}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30 transition disabled:opacity-50"
              title={t.aiConnections?.applyConfig || "一键配置客户端"}
            >
              {isApplying
                ? (t.aiConnections?.applyingConfig || "...")
                : (t.aiConnections?.quickSetup || "一键配置")}
            </button>
          )}

          {/* Test Button for active or configured connections */}
          {(connection.status === "connected" || connection.status === "configured") && !isChatGPT && (
            <button
              onClick={() => onTest(connection.id)}
              disabled={isTesting}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition disabled:opacity-50 flex items-center gap-1"
              title={t.aiConnections?.testConnection || "测试连接"}
            >
              {isTesting && <RefreshCw className="w-3 h-3 animate-spin text-sky-500" />}
              <span>{isTesting ? (t.aiConnections?.testingConnection || "...") : (t.aiConnections?.testConnection || "测试")}</span>
            </button>
          )}

          {/* Details & Config Drawer Trigger */}
          <button
            onClick={() => onOpenDetails(connection)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-theme-primary text-theme-inverse hover:opacity-90 transition flex items-center gap-1 shadow-sm"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{t.aiConnections?.viewDetails || "配置与详情"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
