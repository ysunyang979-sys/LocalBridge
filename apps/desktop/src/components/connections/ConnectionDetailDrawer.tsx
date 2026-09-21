import React, { useState, useEffect } from "react";
import {
  X,
  ShieldCheck,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Star,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Download,
  FileCode,
  Radio,
  Clock,
} from "lucide-react";
import type {
  AIConnectionDto,
  AIConnectionConfig,
  TestConnectionResult,
  TunnelStatusDto,
} from "../../types.js";
import { RemoteMcpEndpointResolver } from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { resolveConnectionViewModel } from "./view-model.js";
import { bridge } from "../../api/bridge.js";

interface ConnectionDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  connection: AIConnectionDto | null;
  isPrimary: boolean;
  tunnelStatus?: TunnelStatusDto | null;
  onOpenTunnel?: () => void;
  onSetPrimary: (id: string) => Promise<void>;
  onRotateToken: (id: string, scopes?: string[]) => Promise<{ tokenId: string; token: string } | void>;
  onRevokeToken?: (id: string) => Promise<void>;
  onTestConnection: (id: string) => Promise<TestConnectionResult>;
  onSaveConfig: (config: AIConnectionConfig) => Promise<void>;
  onDeleteConnection: (id: string) => Promise<void>;
  onPreviewConfig?: (conn: AIConnectionDto) => void;
  onOpenKimiGuide?: () => void;
}

export const ConnectionDetailDrawer: React.FC<ConnectionDetailDrawerProps> = ({
  isOpen,
  onClose,
  connection,
  isPrimary,
  tunnelStatus,
  onOpenTunnel,
  onSetPrimary,
  onRotateToken,
  onRevokeToken,
  onTestConnection,
  onSaveConfig,
  onDeleteConnection,
  onPreviewConfig,
  onOpenKimiGuide,
}) => {
  const { t, language } = useTranslation();
  const isZh = language === "zh-CN";

  // ALL HOOKS UNCONDITIONALLY AT THE VERY TOP
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read", "write"]);
  const [newlyGeneratedToken, setNewlyGeneratedToken] = useState<string | null>(null);
  const [copiedNewToken, setCopiedNewToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPlugin, setIsExportingPlugin] = useState(false);
  const [exportSuccessPath, setExportSuccessPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showKimiGuide, setShowKimiGuide] = useState(false);

  // Form state for Tool/API adapters
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  // Resolve defensive view model
  const vm = resolveConnectionViewModel(connection, tunnelStatus);

  useEffect(() => {
    if (vm) {
      setEndpoint(vm.endpoint || "");
      setModel((vm.metadata?.model as string) || "");
      setApiKey("");
      setTestResult(null);
      setSaveSuccess(false);
      setExportSuccessPath(null);
      setExportError(null);
    }
  }, [vm?.id, vm?.endpoint]);

  // If drawer is not open, do not render DOM
  if (!isOpen) return null;

  // Defensive fallback if connection is missing or invalid
  if (!vm) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-fade-in">
        <div className="w-full max-w-md h-full bg-theme-card border-l border-theme-subtle shadow-2xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-5 h-5" />
                <h3 className="font-bold text-sm text-theme-primary">
                  {isZh ? "无法打开连接详情" : "Connection Details Unavailable"}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-theme-muted leading-relaxed">
              {isZh
                ? "所选连接的数据不完整或尚未就绪，请刷新重试。"
                : "The selected connection data is incomplete or unavailable. Please refresh and try again."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl text-xs font-semibold bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    );
  }

  const isNativeMcp = vm.category === "native-mcp";
  const isKimiWeb = vm.clientType === "kimi-web";
  const isChatGPT = vm.clientType === "chatgpt";
  const isTunnelClient = isKimiWeb || vm.transport === "tunnel";

  const isCustomOrAdapter = ![
    "conn_chatgpt",
    "conn_kimi_web",
    "conn_kimi",
    "conn_claude",
    "conn_gemini",
  ].includes(vm.id);

  const tunnelRes = RemoteMcpEndpointResolver.resolve(tunnelStatus);
  const resolvedEndpoint = isTunnelClient ? tunnelRes.endpoint : vm.endpoint;

  const mcpConfigSnippet = resolvedEndpoint
    ? JSON.stringify(
        {
          mcpServers: {
            nexus: {
              url: resolvedEndpoint,
              headers: {
                Authorization: `Bearer ${vm.tokenMasked || "YOUR_NEXUS_TOKEN"}`,
              },
            },
          },
        },
        null,
        2
      )
    : "";

  const handleCopyToken = () => {
    if (vm.tokenMasked) {
      navigator.clipboard.writeText(vm.tokenMasked);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleCopySnippet = () => {
    if (mcpConfigSnippet) {
      navigator.clipboard.writeText(mcpConfigSnippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  const handleCopyPrompt = () => {
    const prompt = RemoteMcpEndpointResolver.generatePluginBuilderPrompt(tunnelStatus);
    if (prompt) {
      navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleCopyEndpoint = (text: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    }
  };

  const handleRotateToken = async () => {
    setIsRotating(true);
    try {
      const res = await onRotateToken(vm.id, tokenScopes);
      if (res && (res as any).token) {
        setNewlyGeneratedToken((res as any).token);
      }
    } finally {
      setIsRotating(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!onRevokeToken) return;
    if (!confirm(isZh ? "确定要撤销此客户端的专属访问令牌吗？撤销后该客户端将无法访问 Nexus。" : "Are you sure you want to revoke this client's access token?")) {
      return;
    }
    setIsRevoking(true);
    try {
      await onRevokeToken(vm.id);
      setNewlyGeneratedToken(null);
    } finally {
      setIsRevoking(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestConnection(vm.id);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const handleExportKimiPlugin = async () => {
    if (!tunnelRes.endpoint) {
      setExportError(isZh ? "安全隧道未连接，无法获取真实公网端点" : "Secure Tunnel is offline");
      return;
    }
    setIsExportingPlugin(true);
    setExportError(null);
    setExportSuccessPath(null);
    try {
      const res = await bridge.exportKimiPlugin(tunnelRes.endpoint);
      if (res.success) {
        setExportSuccessPath(res.exportDir);
      } else {
        setExportError((res as any).message || "Failed to export plugin");
      }
    } catch (err: any) {
      setExportError(err?.message || "Failed to export plugin");
    } finally {
      setIsExportingPlugin(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const updatedConfig: AIConnectionConfig = {
        id: vm.id,
        clientType: vm.clientType,
        name: vm.name,
        category: vm.category,
        transport: vm.transport,
        endpoint: endpoint.trim() || undefined,
        baseUrl: endpoint.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        model: model.trim() || undefined,
        metadata: {
          ...vm.metadata,
          model: model.trim() || undefined,
        },
      };
      await onSaveConfig(updatedConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Status Badge Rendering helper
  const renderStatusBadge = () => {
    switch (vm.status) {
      case "connected":
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t.aiConnections?.statusConnected || "已连接"}
          </span>
        );
      case "configured":
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            {t.aiConnections?.statusConfigured || "已配置"}
          </span>
        );
      case "offline":
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30">
            <Clock className="w-3 h-3" />
            {t.aiConnections?.statusOffline || "离线"}
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
            <AlertCircle className="w-3 h-3" />
            {t.aiConnections?.statusError || "异常"}
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30">
            {t.aiConnections?.statusNotConfigured || "未配置"}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-[480px] h-full bg-theme-card border-l border-theme-subtle shadow-2xl flex flex-col justify-between overflow-hidden transition-all duration-200">
        {/* Header */}
        <div className="p-5 border-b border-theme-subtle flex items-start justify-between gap-3 bg-theme-card">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-theme-primary truncate">{vm.name}</h2>
              {isPrimary && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  {t.aiConnections?.isPrimary || "首选"}
                </span>
              )}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-theme-card-muted border border-theme-subtle text-theme-secondary">
                {isKimiWeb ? "Kimi Plugin · MCP" : isNativeMcp ? (t.aiConnections?.categoryNativeMcp || "原生 MCP") : (t.aiConnections?.categoryToolAdapter || "API 模型")}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {renderStatusBadge()}
              {isTunnelClient && (
                <span className="text-[11px] text-theme-muted font-mono flex items-center gap-1">
                  <Radio className="w-3 h-3 text-sky-500" />
                  Secure Tunnel
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs font-sans">
          {/* Security Shield Notice */}
          <div className="p-3.5 rounded-xl bg-sky-500/5 border border-sky-500/20 space-y-1">
            <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4 text-sky-500 shrink-0" />
              <span>{t.aiConnections?.securityBanner}</span>
            </div>
            <p className="text-[11px] text-theme-muted">
              {isZh
                ? "项目目录边界 · 敏感操作审批 · 密钥与隐私保护 · 紧急停止"
                : "Project Boundaries · Human Approvals · Protected Files · Emergency Stop"}
            </p>
          </div>

          {/* ==================== KIMI WEB DEDICATED STRUCTURE ==================== */}
          {isKimiWeb && (
            <div className="space-y-4">
              {/* Remote MCP Endpoint Panel */}
              <div className="space-y-2">
                <label className="font-semibold text-theme-primary text-xs flex items-center justify-between">
                  <span>{t.aiConnections?.remoteMcpEndpoint || "Remote MCP Endpoint"}</span>
                  {tunnelRes.isAvailable && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                      ● {isZh ? "已在线" : "Online"}
                    </span>
                  )}
                </label>

                {tunnelRes.isAvailable && tunnelRes.endpoint ? (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between gap-2">
                    <div className="min-w-0 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 truncate">
                      {tunnelRes.endpoint}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyEndpoint(tunnelRes.endpoint!)}
                      className="px-2 py-1 rounded bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle shrink-0 transition flex items-center gap-1 font-medium"
                    >
                      {copiedEndpoint ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedEndpoint ? (t.common.copied || "已复制") : (t.aiConnections?.copyEndpoint || "复制地址")}</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center justify-between gap-3 text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{t.aiConnections?.secureTunnelOffline || "安全隧道未连接"}</span>
                    </div>
                    {onOpenTunnel && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenTunnel();
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1 shrink-0 shadow-xs"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{isZh ? "启用隧道" : "Open Tunnel"}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Metrics: Tools & Scopes */}
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-theme-card-muted border border-theme-subtle text-xs">
                <div>
                  <span className="text-theme-muted block text-[11px]">{t.aiConnections?.toolsCount || "可用工具数"}</span>
                  <span className="font-bold text-sm text-theme-primary font-mono mt-0.5 block">{vm.toolCount || 55}</span>
                </div>
                <div>
                  <span className="text-theme-muted block text-[11px]">{t.aiConnections?.scopesLabel || "权限作用域"}</span>
                  <span className="font-semibold text-xs text-theme-secondary font-mono mt-0.5 block truncate" title={vm.scopes.join(", ")}>
                    {vm.scopes.join(", ") || "read, write"}
                  </span>
                </div>
              </div>

              {/* 快速操作 (Quick Actions) */}
              <div className="space-y-2 pt-1 border-t border-theme-subtle">
                <label className="font-semibold text-theme-primary text-xs">
                  {isZh ? "快速操作" : "Quick Actions"}
                </label>

                <div className="grid grid-cols-1 gap-2">
                  {/* Copy Plugin Builder Prompt */}
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    disabled={!tunnelRes.isAvailable}
                    className="w-full p-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 transition flex items-center justify-between font-semibold disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      <span>{t.aiConnections?.copyPluginBuilderPrompt || "复制 Plugin Builder 提示词"}</span>
                    </div>
                    {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>

                  {/* Toggle 9-Step Guide Inline */}
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenKimiGuide) {
                        onClose();
                        onOpenKimiGuide();
                      } else {
                        setShowKimiGuide(!showKimiGuide);
                      }
                    }}
                    className="w-full p-2.5 rounded-xl bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition flex items-center justify-between font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-sky-500" />
                      <span>{t.aiConnections?.installationGuide || "安装步骤 (9 步图文指南)"}</span>
                    </div>
                    <span className="text-xs text-theme-muted font-mono">{showKimiGuide ? "▲" : "▼"}</span>
                  </button>

                  {/* Inline 9-Step Guide Collapse */}
                  {showKimiGuide && (
                    <div className="p-3.5 rounded-xl bg-theme-card-muted border border-theme-subtle space-y-2 text-xs animate-fade-in">
                      <div className="font-bold text-theme-primary">
                        {isZh ? "Kimi 网页版接入指南" : "Kimi Web 9-Step Guide"}
                      </div>
                      <ol className="list-decimal list-inside space-y-1.5 text-theme-secondary text-[11px] leading-relaxed">
                        <li>访问 <strong>kimi.com</strong> 并登录。</li>
                        <li>进入 <strong>Work</strong> 工作区。</li>
                        <li>打开对话框底部的 <strong>插件管理</strong>。</li>
                        <li>点击 <strong>自定义插件 (Plugin Builder)</strong>。</li>
                        <li>选择创建新插件并粘贴上方复制的提示词。</li>
                        <li>确认服务端点为当前 Nexus 公网 HTTPS 地址。</li>
                        <li>填入下方专属访问令牌（Bearer Token）。</li>
                        <li>在会话工具栏中勾选并启用 Nexus 插件。</li>
                        <li>发送「请使用 Nexus 列出当前项目」完成验收。</li>
                      </ol>
                    </div>
                  )}

                  {/* Export Kimi Plugin */}
                  <button
                    type="button"
                    onClick={handleExportKimiPlugin}
                    disabled={isExportingPlugin || !tunnelRes.isAvailable}
                    className="w-full p-2.5 rounded-xl bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition flex items-center justify-between font-medium disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-teal-500" />
                      <span>{t.aiConnections?.exportKimiPlugin || "导出 Kimi 插件包 (kimi.plugin.json)"}</span>
                    </div>
                    {isExportingPlugin && <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-500" />}
                  </button>

                  {exportSuccessPath && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-mono break-all">
                      <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 text-emerald-500" />
                      {isZh ? "插件包已成功导出至：" : "Exported to: "} {exportSuccessPath}
                    </div>
                  )}

                  {exportError && (
                    <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
                      {exportError}
                    </div>
                  )}
                </div>
              </div>

              {/* 专属权限与令牌管理 (Scopes & Dedicated Token) */}
              <div className="space-y-3 pt-2 border-t border-theme-subtle">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-theme-primary text-xs">
                    {isZh ? "专属授权权限 (Scopes)" : "Authorized Scopes"}
                  </label>
                  <span className="text-[10px] text-theme-muted font-mono">
                    {isZh ? "最小权限原则" : "Least Privilege"}
                  </span>
                </div>

                <div className="space-y-2 p-3 rounded-xl bg-theme-card-muted border border-theme-subtle text-xs">
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tokenScopes.includes("read")}
                        onChange={(e) => {
                          if (e.target.checked) setTokenScopes([...tokenScopes, "read"]);
                          else setTokenScopes(tokenScopes.filter((s) => s !== "read"));
                        }}
                        className="rounded border-theme-input text-sky-600 focus:ring-sky-500"
                      />
                      <span className="font-medium text-theme-primary">{isZh ? "读取 (Read)" : "Read"}</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tokenScopes.includes("write")}
                        onChange={(e) => {
                          if (e.target.checked) setTokenScopes([...tokenScopes, "write"]);
                          else setTokenScopes(tokenScopes.filter((s) => s !== "write"));
                        }}
                        className="rounded border-theme-input text-sky-600 focus:ring-sky-500"
                      />
                      <span className="font-medium text-theme-primary">{isZh ? "写入 (Write)" : "Write"}</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tokenScopes.includes("execute")}
                        onChange={(e) => {
                          if (e.target.checked) setTokenScopes([...tokenScopes, "execute"]);
                          else setTokenScopes(tokenScopes.filter((s) => s !== "execute"));
                        }}
                        className="rounded border-theme-input text-sky-600 focus:ring-sky-500"
                      />
                      <span className="font-medium text-theme-primary">{isZh ? "命令执行 (Execute，高危)" : "Execute (High Risk)"}</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-theme-muted">
                    {isZh
                      ? "命令执行默认关闭；即使授予 execute 权限，高危命令仍须经 Nexus 人工审批。"
                      : "Execute is OFF by default; commands still require Nexus human approval."}
                  </p>
                </div>

                {/* Plaintext Token Banner (Shown Only Once Upon Generation) */}
                {newlyGeneratedToken && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs animate-fade-in">
                    <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200">
                      <KeyRound className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{isZh ? "专属访问令牌已生成（仅显示一次）" : "Dedicated Token Generated (Shown Once)"}</span>
                    </div>
                    <p className="text-[11px] text-theme-muted">
                      {isZh
                        ? "请立即保存。关闭后 Nexus 将不会再次显示完整令牌。"
                        : "Please copy and save immediately. For security, Nexus will never display the full token again."}
                    </p>
                    <div className="p-2 rounded-lg bg-black/10 dark:bg-black/30 font-mono text-[11px] break-all flex items-center justify-between gap-2">
                      <span className="text-amber-900 dark:text-amber-100">{newlyGeneratedToken}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(newlyGeneratedToken);
                          setCopiedNewToken(true);
                          setTimeout(() => setCopiedNewToken(false), 2000);
                        }}
                        className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 font-semibold shrink-0 transition"
                      >
                        {copiedNewToken ? (isZh ? "已复制" : "Copied") : (isZh ? "复制完整令牌" : "Copy")}
                      </button>
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setNewlyGeneratedToken(null)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition shadow-xs"
                      >
                        {isZh ? "我已保存并关闭" : "I have saved it, dismiss"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Generate / Rotate / Revoke Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRotateToken}
                    disabled={isRotating}
                    className="flex-1 py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isRotating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>
                      {vm.tokenId
                        ? (isRotating ? (t.aiConnections?.rotatingToken || "正在轮换...") : (isZh ? "重新生成 / 轮换令牌" : "Rotate Token"))
                        : (isRotating ? "正在生成..." : (isZh ? "生成 Kimi Web 专属令牌" : "Generate Kimi Web Token"))}
                    </span>
                  </button>

                  {vm.tokenId && onRevokeToken && (
                    <button
                      type="button"
                      onClick={handleRevokeToken}
                      disabled={isRevoking}
                      className="py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-semibold transition flex items-center gap-1 disabled:opacity-50"
                    >
                      {isRevoking && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isZh ? "撤销授权" : "Revoke"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 高级信息与遥测 (Advanced Telemetry & Token) */}
              <div className="space-y-2.5 pt-2 border-t border-theme-subtle">
                <label className="font-semibold text-theme-primary text-xs">
                  {isZh ? "高级信息与认证状态" : "Advanced & Auth Status"}
                </label>

                <div className="space-y-2 p-3 rounded-xl bg-theme-card-muted border border-theme-subtle text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-theme-muted">Token ID:</span>
                    <span className="text-theme-primary font-semibold truncate max-w-[200px]">
                      {vm.tokenId || (isZh ? "未生成" : "Unset")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-theme-muted">Masked Token:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-theme-secondary">{vm.tokenMasked || "lb_kimi_••••••••"}</span>
                      {vm.tokenMasked && (
                        <button
                          type="button"
                          onClick={handleCopyToken}
                          className="p-1 hover:text-theme-primary transition"
                          title={t.aiConnections?.copyToken}
                        >
                          {copiedToken ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-theme-muted">Tunnel Status:</span>
                    <span className="text-theme-secondary font-semibold">
                      {tunnelStatus?.status || "Unknown"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-theme-muted">Auth Status:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      {vm.tokenMasked ? (isZh ? "已配置专属凭证" : "Active") : (isZh ? "等待授权" : "Awaiting Authorization")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-theme-muted">Last Seen:</span>
                    <span className="text-theme-muted">
                      {vm.lastSeenAt ? new Date(vm.lastSeenAt).toLocaleString() : "--"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== STANDARD / OTHER CLIENTS ==================== */}
          {!isKimiWeb && (
            <>
              {/* Tunnel Notice for ChatGPT */}
              {isChatGPT && (
                <div className="space-y-2">
                  <label className="font-semibold text-theme-primary text-xs">
                    {isZh ? "安全隧道连接状态" : "Secure Tunnel Status"}
                  </label>
                  {tunnelRes.isAvailable && tunnelRes.endpoint ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between gap-2">
                      <div className="min-w-0 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 truncate">
                        {tunnelRes.endpoint}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyEndpoint(tunnelRes.endpoint!)}
                        className="px-2 py-1 rounded bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle shrink-0 transition flex items-center gap-1"
                      >
                        {copiedEndpoint ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedEndpoint ? (t.common.copied || "已复制") : (t.aiConnections?.copyEndpoint || "复制地址")}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center justify-between gap-3 text-amber-800 dark:text-amber-200">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{t.aiConnections?.secureTunnelOffline || "安全隧道未连接"}</span>
                      </div>
                      {onOpenTunnel && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenTunnel();
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1 shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>{isZh ? "启用隧道" : "Open Tunnel"}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Token & Authentication */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-theme-primary flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-sky-500" />
                    <span>{t.aiConnections?.clientToken || "Dedicated Client Token"}</span>
                  </label>
                  <button
                    onClick={handleRotateToken}
                    disabled={isRotating}
                    className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRotating ? "animate-spin" : ""}`} />
                    <span>{isRotating ? (t.aiConnections?.rotatingToken || "Rotating...") : (t.aiConnections?.rotateToken || "Rotate Token")}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2.5 rounded-lg bg-theme-card-muted border border-theme-subtle font-mono text-xs text-theme-primary truncate">
                    {vm.tokenMasked || "lb_••••••••••••••••"}
                  </div>
                  <button
                    onClick={handleCopyToken}
                    className="p-2.5 rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition"
                    title={copiedToken ? (t.aiConnections?.tokenCopied || "Copied") : (t.aiConnections?.copyToken || "Copy Token")}
                  >
                    {copiedToken ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                {/* Scopes */}
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-theme-muted">{t.aiConnections?.scopesLabel || "Scopes"}:</span>
                  {vm.scopes.map((scope: string) => (
                    <span
                      key={scope}
                      className="px-2 py-0.5 rounded font-mono bg-theme-card-muted text-theme-secondary border border-theme-subtle"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>

              {/* Form for Tool/API Adapters (DeepSeek, OpenAI-compatible) */}
              {!isNativeMcp && (
                <form onSubmit={handleSave} className="space-y-3.5 p-4 rounded-xl bg-theme-card-muted border border-theme-subtle">
                  <div className="font-semibold text-theme-primary text-xs">
                    {isZh ? "API 模型与端点配置" : "API Model & Endpoint Configuration"}
                  </div>

                  <div className="space-y-1">
                    <label className="text-theme-muted text-[11px] block font-mono">Base URL / Endpoint</label>
                    <input
                      type="text"
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="https://api.deepseek.com/v1"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-theme-muted text-[11px] block font-mono">Model Name</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="deepseek-chat / gpt-4o"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-theme-muted text-[11px] block font-mono">
                      API Key (Stored Securely via DPAPI)
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={vm.metadata?.hasApiKey ? "sk-•••••••• (Saved)" : "Enter API Key"}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    {saveSuccess && (
                      <span className="text-emerald-500 text-xs flex items-center gap-1 font-semibold">
                        <Check className="w-3.5 h-3.5" />
                        <span>{t.common.saved}</span>
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="ml-auto px-4 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition disabled:opacity-50"
                    >
                      {isSaving ? t.common.loading : t.common.save}
                    </button>
                  </div>
                </form>
              )}

              {/* Native MCP Config Snippet */}
              {isNativeMcp && !isChatGPT && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-theme-primary text-xs">
                      MCP Client Snippet
                    </label>
                    {mcpConfigSnippet && (
                      <button
                        onClick={handleCopySnippet}
                        className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                      >
                        {copiedSnippet ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSnippet ? t.common.copied : t.common.copy}</span>
                      </button>
                    )}
                  </div>
                  {mcpConfigSnippet && (
                    <div className="p-3 rounded-lg bg-zinc-950 text-zinc-100 border border-zinc-800 text-[11px] font-mono overflow-x-auto">
                      <pre>{mcpConfigSnippet}</pre>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Test Connection Diagnostic Box */}
          <div className="space-y-2 pt-2 border-t border-theme-subtle">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-theme-primary text-xs">
                {t.aiConnections?.testConnection || "Test Connection"}
              </label>
              <button
                onClick={handleTest}
                disabled={isTesting}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isTesting ? "animate-spin" : ""}`} />
                <span>{isTesting ? (t.aiConnections?.testingConnection || "Testing...") : (t.aiConnections?.testConnection || "测试连接")}</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-mono space-y-1 ${
                  testResult.success
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <span>{testResult.success ? t.aiConnections?.testSuccess : t.aiConnections?.testFailed}</span>
                  {testResult.latencyMs !== undefined && (
                    <span className="opacity-75">({testResult.latencyMs} ms)</span>
                  )}
                </div>
                <p className="text-[11px] opacity-90">{testResult.message}</p>
                {testResult.error && (
                  <div className="mt-1 p-2 rounded bg-black/20 text-[10px] whitespace-pre-wrap">
                    {testResult.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-theme-subtle bg-theme-card-muted flex items-center justify-between gap-2">
          <div>
            {!isPrimary && (
              <button
                type="button"
                onClick={() => onSetPrimary(vm.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition"
              >
                <Star className="w-3.5 h-3.5" />
                <span>{t.aiConnections?.setAsPrimary || "设为首选"}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isCustomOrAdapter && (
              <button
                type="button"
                onClick={() => onDeleteConnection(vm.id)}
                className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition"
                title={t.aiConnections?.deleteConnection || "Delete Connection"}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {isNativeMcp &&
              !isChatGPT &&
              !isKimiWeb &&
              onPreviewConfig && (
                <button
                  type="button"
                  onClick={() => onPreviewConfig(connection!)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 transition"
                >
                  {t.aiConnections?.previewConfig || "写入配置"}
                </button>
              )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover border border-theme-subtle transition"
            >
              {t.common.close}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
