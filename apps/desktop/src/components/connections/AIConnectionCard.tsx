import React, { useState } from "react";
import {
  Radio,
  Sparkles,
  Zap,
  Terminal,
  Cpu,
  FileCode,
  CheckCircle2,
  Clock,
  AlertCircle,
  Settings,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import type {
  AIConnectionDto,
  TestConnectionResult,
  TunnelStatusDto,
} from "../../types.js";
import { RemoteMcpEndpointResolver } from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { resolveConnectionViewModel } from "./view-model.js";

interface AIConnectionCardProps {
  connection: AIConnectionDto;
  mode: "standard" | "advanced";
  isPrimary: boolean;
  tunnelStatus?: TunnelStatusDto | null;
  onSetPrimary: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<TestConnectionResult>;
  onOpenDetails: (connection: AIConnectionDto) => void;
  onApplyConfig?: (connection: AIConnectionDto) => void;
  onOpenTunnel?: () => void;
  onOpenKimiPlugin?: (connection: AIConnectionDto, initialTab?: "guide" | "token" | "manifest") => void;
  isTesting?: boolean;
  isApplying?: boolean;
}

export const AIConnectionCard: React.FC<AIConnectionCardProps> = ({
  connection,
  mode,
  isPrimary,
  tunnelStatus,
  onSetPrimary,
  onTest,
  onOpenDetails,
  onApplyConfig,
  onOpenTunnel,
  onOpenKimiPlugin,
  isTesting,
  isApplying,
}) => {
  const { t, language } = useTranslation();
  const isZh = language === "zh-CN";

  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Defensively resolve view model
  const vm = resolveConnectionViewModel(connection, tunnelStatus);
  if (!vm) return null;

  const getClientIcon = (clientType: string) => {
    switch (clientType) {
      case "chatgpt":
        return <Radio className="w-5 h-5 text-emerald-500" />;
      case "kimi-web":
        return <Sparkles className="w-5 h-5 text-indigo-500" />;
      case "kimi":
        return <Terminal className="w-5 h-5 text-purple-500" />;
      case "claude":
        return <Zap className="w-5 h-5 text-amber-500" />;
      case "gemini":
        return <Terminal className="w-5 h-5 text-sky-500" />;
      case "deepseek":
        return <Cpu className="w-5 h-5 text-blue-500" />;
      default:
        return <FileCode className="w-5 h-5 text-cyan-500" />;
    }
  };

  // Status badge with unified color taxonomy:
  // - 已连接: Green
  // - 已检测: Sky
  // - 已配置: Blue
  // - 未配置: Neutral Gray
  // - 离线: Slate / Gray-blue
  // - 异常: Red
  const getStatusBadge = () => {
    // If client config file is detected on disk (e.g. Claude, Gemini) and not yet connected:
    if (vm.isDetected && vm.status !== "connected") {
      return (
        <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30">
          <CheckCircle2 className="w-3 h-3" />
          {t.aiConnections?.statusDetected || "已检测"}
        </span>
      );
    }

    switch (vm.status) {
      case "connected":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t.aiConnections?.statusConnected || "已连接"}
          </span>
        );
      case "configured":
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <CheckCircle2 className="w-3 h-3" />
            {t.aiConnections?.statusConfigured || "已配置"}
          </span>
        );
      case "connecting":
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {t.aiConnections?.statusConnecting || "连接中"}
          </span>
        );
      case "offline":
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30">
            <Clock className="w-3 h-3" />
            {t.aiConnections?.statusOffline || "离线"}
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
            <AlertCircle className="w-3 h-3" />
            {t.aiConnections?.statusError || "异常"}
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30">
            {t.aiConnections?.statusNotConfigured || "未配置"}
          </span>
        );
    }
  };

  const isNativeMcp = vm.category === "native-mcp";
  const isConnected = vm.status === "connected";
  const isChatGPT = vm.clientType === "chatgpt";
  const isKimiWeb = vm.clientType === "kimi-web";
  const isConfigured = vm.status === "configured" || vm.status === "connected";

  const tunnelRes = RemoteMcpEndpointResolver.resolve(tunnelStatus);

  const handleCopyEndpoint = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const handleCopyPrompt = () => {
    const prompt = RemoteMcpEndpointResolver.generatePluginBuilderPrompt(tunnelStatus);
    if (prompt) {
      navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  // Standardized, human-readable client descriptions
  const getDefaultDescription = () => {
    switch (vm.clientType) {
      case "chatgpt":
        return isZh
          ? "通过 Secure MCP Tunnel 安全连接到 ChatGPT，提供全功能本地工具沙箱。"
          : "Direct connection to ChatGPT via Secure MCP Tunnel with full local sandbox.";
      case "kimi-web":
        return isZh
          ? "通过 Kimi 网页版插件安全连接 Nexus。"
          : "Securely connect to Nexus via Kimi Web plugin.";
      case "kimi":
        return isZh
          ? "Kimi Code 开发者命令行与本地客户端，通过 ~/.kimi-code/mcp.json 接入。"
          : "Kimi Code developer CLI connecting via ~/.kimi-code/mcp.json.";
      case "claude":
        return isZh
          ? "支持 Claude Desktop 与 Claude Code CLI，写入本地 MCP 配置即可生效。"
          : "Supports Claude Desktop & Claude Code CLI via local MCP configuration.";
      case "gemini":
        return isZh
          ? "Google Gemini 命令行工具，通过 ~/.gemini/settings.json 建立通信。"
          : "Google Gemini CLI via ~/.gemini/settings.json MCP configuration.";
      case "deepseek":
        return isZh
          ? "深度求索 API 模型，使用 Function Calling 适配器映射本地工具并统一执行安全策略。"
          : "DeepSeek API model using Function Calling adapter with full Nexus security enforcement.";
      default:
        return isZh
          ? "标准通用接口端点，统一由 Nexus 执行权限隔离与审批保护。"
          : "Standard generic endpoint governed by Nexus policy gates.";
    }
  };

  return (
    <div
      className={`p-4 rounded-2xl bg-theme-card border transition-all duration-150 flex flex-col justify-between hover:shadow-sm ${
        isPrimary
          ? "border-sky-500/50 shadow-xs ring-1 ring-sky-500/20"
          : "border-theme-subtle hover:border-theme-strong"
      }`}
    >
      <div className="space-y-3">
        {/* Card Header: Icon, Name, Category & Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-theme-card-muted border border-theme-subtle shrink-0">
              {getClientIcon(vm.clientType)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-theme-primary truncate">
                  {vm.name}
                </h3>
                {isPrimary && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    {t.aiConnections?.isPrimary || "主要"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-theme-muted font-mono">
                <span>
                  {isKimiWeb
                    ? "Kimi Plugin · MCP"
                    : isNativeMcp
                    ? (t.aiConnections?.categoryNativeMcp || "原生 MCP")
                    : (t.aiConnections?.categoryToolAdapter || "API 模型")}
                </span>
                {(mode === "advanced" || vm.transport === "tunnel") && (
                  <>
                    <span>&bull;</span>
                    <span>
                      {vm.transport === "tunnel"
                        ? "Secure Tunnel"
                        : vm.transport === "streamable-http"
                        ? "Streamable"
                        : "HTTP"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0">{getStatusBadge()}</div>
        </div>

        {/* Description */}
        <p className="text-xs text-theme-secondary leading-relaxed line-clamp-2">
          {getDefaultDescription()}
        </p>

        {/* ==================== CHATGPT COMPACT VIEW ==================== */}
        {isChatGPT && (
          <div className="pt-2 border-t border-theme-subtle flex items-center justify-between text-xs font-mono">
            <div className="text-theme-muted">
              <span>{t.aiConnections?.toolsCount || "工具"}: </span>
              <span className="font-bold text-theme-primary">{vm.toolCount || 55}</span>
            </div>
            <div className="text-theme-muted">
              <span>{t.aiConnections?.latencyLabel || "延迟"}: </span>
              <span className="text-theme-secondary">{vm.latencyMs ? `${vm.latencyMs} ms` : "12 ms"}</span>
            </div>
          </div>
        )}

        {/* ==================== KIMI WEB SPECIAL BANNER ==================== */}
        {isKimiWeb && (
          <div className="pt-1 space-y-2 text-xs">
            {tunnelRes.isAvailable && tunnelRes.endpoint ? (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2">
                <div className="min-w-0 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 truncate">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 mr-1">Remote MCP:</span>
                  <span>{tunnelRes.endpoint}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyEndpoint(tunnelRes.endpoint!)}
                  className="px-2 py-0.5 rounded bg-theme-card hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle text-[11px] font-medium shrink-0 transition flex items-center gap-1"
                >
                  {copiedEndpoint ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedEndpoint ? (t.common.copied || "已复制") : (t.aiConnections?.copyEndpoint || "复制")}</span>
                </button>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-2 text-amber-800 dark:text-amber-200">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{t.aiConnections?.secureTunnelOffline || "安全隧道未连接"}</span>
                </div>
                {onOpenTunnel && (
                  <button
                    type="button"
                    onClick={onOpenTunnel}
                    className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-amber-600 hover:bg-amber-500 text-white transition shrink-0"
                  >
                    {isZh ? "启用隧道" : "Open"}
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 py-1 text-[11px] font-mono border-t border-theme-subtle text-theme-muted">
              <div>
                <span>{t.aiConnections?.toolsCount || "工具"}: </span>
                <span className="font-bold text-theme-primary">{vm.toolCount || 55}</span>
              </div>
              <div className="truncate" title={vm.scopes.join(", ")}>
                <span>{t.aiConnections?.scopesLabel || "权限"}: </span>
                <span className="text-theme-secondary">{vm.scopes.join(", ") || "read, write"}</span>
              </div>
            </div>
          </div>
        )}

        {/* ==================== OTHER CLIENTS METRICS ==================== */}
        {!isChatGPT && !isKimiWeb && (
          <div className="space-y-1.5 pt-1">
            {vm.detectedConfigPath ? (
              <div className="text-[11px] text-theme-secondary font-mono truncate bg-theme-card-muted px-2 py-1 rounded border border-theme-subtle">
                <span className="text-theme-muted">{t.aiConnections?.configDetected || "已检测配置"}: </span>
                <span className="font-semibold">{vm.detectedConfigPath}</span>
              </div>
            ) : isNativeMcp ? (
              <div className="text-[11px] text-theme-muted truncate font-mono">
                {t.aiConnections?.configNotFound || "未检测到本地配置文件"}
              </div>
            ) : null}

            {Boolean(vm.metadata?.model) && (
              <div className="text-[11px] text-theme-secondary font-mono truncate">
                <span className="text-theme-muted">Model: </span>
                <span className="font-semibold text-theme-primary">{String(vm.metadata?.model)}</span>
              </div>
            )}

            {vm.endpoint && (
              <div className="text-[11px] text-theme-muted font-mono truncate">
                <span>Endpoint: </span>
                <span className="text-theme-secondary">{vm.endpoint}</span>
              </div>
            )}

            {/* Metrics Row: Tools, scopes, latency */}
            <div className="grid grid-cols-3 gap-2 py-1.5 mt-1 border-t border-theme-subtle text-[11px] font-mono">
              <div>
                <div className="text-theme-muted">{t.aiConnections?.toolsCount || "工具数"}</div>
                <div className="font-bold text-theme-primary mt-0.5">{vm.toolCount || 55}</div>
              </div>
              <div>
                <div className="text-theme-muted">{t.aiConnections?.scopesLabel || "权限"}</div>
                <div className="text-theme-secondary mt-0.5 truncate" title={vm.scopes.join(", ")}>
                  {vm.scopes.join(", ") || "read, write"}
                </div>
              </div>
              <div>
                <div className="text-theme-muted">{t.aiConnections?.latencyLabel || "延迟"}</div>
                <div className="text-theme-secondary mt-0.5">
                  {vm.latencyMs !== undefined && vm.latencyMs !== null ? `${vm.latencyMs} ms` : "--"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== ACTION FOOTER ==================== */}
      <div className="pt-3 border-t border-theme-subtle flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-1.5">
          {!isPrimary && (
            <button
              onClick={() => onSetPrimary(vm.id)}
              className="text-[11px] px-2 py-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
              title={t.aiConnections?.setAsPrimary || "设为主 AI"}
            >
              {t.aiConnections?.setAsPrimary || "设为首选"}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* ==================== CHATGPT ACTIONS ==================== */}
          {isChatGPT && (
            <button
              onClick={() => onOpenDetails(connection)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-theme-primary text-theme-inverse hover:opacity-90 transition flex items-center gap-1 shadow-xs"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{t.aiConnections?.viewDetails || "查看详情"}</span>
            </button>
          )}

          {/* ==================== KIMI WEB ACTIONS ==================== */}
          {isKimiWeb && (
            <>
              {/* If unconfigured: show [连接 Kimi] and [安装步骤] */}
              {!isConfigured ? (
                <>
                  {onOpenKimiPlugin && (
                    <button
                      type="button"
                      onClick={() => onOpenKimiPlugin(connection, "guide")}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition flex items-center gap-1"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>{t.aiConnections?.installationGuide || "安装步骤"}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenDetails(connection)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t.aiConnections?.connectKimi || "连接 Kimi"}</span>
                  </button>
                </>
              ) : (
                /* When configured / connected: show quick actions and details */
                <>
                  {tunnelRes.isAvailable && (
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="px-2 py-1 text-xs font-medium rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition flex items-center gap-1"
                      title={t.aiConnections?.copyPluginBuilderPrompt || "复制提示词"}
                    >
                      {copiedPrompt ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPrompt ? (t.common.copied || "已复制") : (t.aiConnections?.copyPluginBuilderPrompt || "复制提示词")}</span>
                    </button>
                  )}

                  <button
                    onClick={() => onOpenDetails(connection)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-theme-primary text-theme-inverse hover:opacity-90 transition flex items-center gap-1 shadow-xs"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{t.aiConnections?.viewDetails || "配置与详情"}</span>
                  </button>
                </>
              )}
            </>
          )}

          {/* ==================== OTHER NATIVE MCP ACTIONS ==================== */}
          {isNativeMcp && !isChatGPT && !isKimiWeb && (
            <>
              {onApplyConfig && vm.status !== "connected" && (
                <button
                  onClick={() => onApplyConfig(connection)}
                  disabled={isApplying}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30 transition disabled:opacity-50"
                  title={t.aiConnections?.applyConfig || "一键配置客户端"}
                >
                  {isApplying
                    ? (t.aiConnections?.applyingConfig || "...")
                    : (t.aiConnections?.quickSetup || "一键配置")}
                </button>
              )}

              {isConnected && (
                <button
                  onClick={() => onTest(vm.id)}
                  disabled={isTesting}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition disabled:opacity-50 flex items-center gap-1"
                  title={t.aiConnections?.testConnection || "测试连接"}
                >
                  {isTesting && <RefreshCw className="w-3 h-3 animate-spin text-sky-500" />}
                  <span>{isTesting ? "..." : (t.aiConnections?.testConnection || "测试")}</span>
                </button>
              )}

              <button
                onClick={() => onOpenDetails(connection)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-theme-primary text-theme-inverse hover:opacity-90 transition flex items-center gap-1 shadow-xs"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{t.aiConnections?.viewDetails || "配置与详情"}</span>
              </button>
            </>
          )}

          {/* ==================== TOOL / API ADAPTERS ACTIONS ==================== */}
          {!isNativeMcp && (
            <>
              {isConnected && (
                <button
                  onClick={() => onTest(vm.id)}
                  disabled={isTesting}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition disabled:opacity-50 flex items-center gap-1"
                >
                  {isTesting && <RefreshCw className="w-3 h-3 animate-spin text-sky-500" />}
                  <span>{isTesting ? "..." : (t.aiConnections?.testConnection || "测试")}</span>
                </button>
              )}

              <button
                onClick={() => onOpenDetails(connection)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-theme-primary text-theme-inverse hover:opacity-90 transition flex items-center gap-1 shadow-xs"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{t.aiConnections?.viewDetails || "配置与详情"}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
