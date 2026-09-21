import React, { useState, useEffect } from "react";
import {
  X,
  Radio,
  KeyRound,
  Download,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Shield,
  Globe,
} from "lucide-react";
import type {
  AIConnectionDto,
  AIConnectionConfig,
  TunnelStatusDto,
  TestConnectionResult,
  KimiPluginManifest,
} from "../../types.js";
import { bridge } from "../../api/bridge.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { resolveTunnelEndpoint } from "./catalog.js";

interface KimiWebPluginModalProps {
  isOpen: boolean;
  onClose: () => void;
  tunnelStatus: TunnelStatusDto | null;
  connection: AIConnectionDto | null;
  onNavigateToTunnel?: () => void;
  onRefreshConnections: () => Promise<void>;
  onTestConnection: (id: string) => Promise<TestConnectionResult>;
}

export const KimiWebPluginModal: React.FC<KimiWebPluginModalProps> = ({
  isOpen,
  onClose,
  tunnelStatus,
  connection,
  onNavigateToTunnel,
  onRefreshConnections,
  onTestConnection,
}) => {
  const { language } = useTranslation();
  const isZh = language === "zh-CN";

  const [activeTab, setActiveTab] = useState<"guide" | "token" | "manifest">("guide");
  const [scopes, setScopes] = useState<string[]>(["read", "write"]);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedManifest, setCopiedManifest] = useState(false);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessPath, setExportSuccessPath] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [manifestData, setManifestData] = useState<KimiPluginManifest | null>(null);

  const isTunnelConnected = tunnelStatus?.status === "Connected";
  const publicTunnelEndpoint = resolveTunnelEndpoint(tunnelStatus);

  useEffect(() => {
    if (isOpen) {
      bridge
        .getKimiPluginManifest(publicTunnelEndpoint)
        .then((res) => setManifestData(res.manifest))
        .catch(() => {});
    }
  }, [isOpen, publicTunnelEndpoint]);

  if (!isOpen) return null;

  const handleGenerateOrRotateToken = async () => {
    setIsGeneratingToken(true);
    try {
      // 1. Ensure connection exists in database
      const baseConfig: AIConnectionConfig = {
        id: "conn_kimi_web",
        clientType: "kimi-web",
        name: "Kimi Web",
        category: "native-mcp",
        transport: "tunnel",
        endpoint: publicTunnelEndpoint,
        scopes,
      };
      await bridge.saveAiConnection(baseConfig);

      // 2. Rotate dedicated token
      const tokenRes = await bridge.rotateAiConnectionToken("conn_kimi_web", scopes);
      setCreatedToken(tokenRes.token);
      await onRefreshConnections();
    } catch (err: any) {
      alert(err?.message || "Failed to generate token");
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleExportPlugin = async () => {
    setIsExporting(true);
    setExportSuccessPath(null);
    try {
      const res = await bridge.exportKimiPlugin(publicTunnelEndpoint);
      if (res.success) {
        setExportSuccessPath(res.exportDir);
      }
    } catch (err: any) {
      alert(err?.message || "Failed to export plugin package");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = (text: string, type: "token" | "url" | "manifest") => {
    navigator.clipboard.writeText(text);
    if (type === "token") {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else if (type === "url") {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedManifest(true);
      setTimeout(() => setCopiedManifest(false), 2000);
    }
  };

  const handleRunTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestConnection("conn_kimi_web");
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const hasToken = Boolean(connection?.tokenId || createdToken);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-theme-card border border-theme-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-theme-primary">
                  {isZh ? "Kimi Web 插件连接向导" : "Kimi Web Plugin Guide"}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                  Kimi Plugin · MCP
                </span>
              </div>
              <p className="text-xs text-theme-muted mt-0.5">
                {isZh
                  ? "通过 Kimi 网页版（kimi.com）安全访问 Nexus 授权的本地项目与工具"
                  : "Securely access Nexus projects & tools via Kimi Web (kimi.com) Plugin"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tunnel Status Alert */}
        <div className="px-6 pt-4">
          {!isTunnelConnected ? (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <div className="font-bold">
                    {isZh ? "需要先启用 Nexus Secure Tunnel" : "Nexus Secure Tunnel Required"}
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    {isZh
                      ? "Kimi 网页版运行在公网云端，无法访问 127.0.0.1。必须启用 Secure Tunnel 获取公网 HTTPS MCP 地址。"
                      : "Kimi Web operates in the cloud and cannot reach 127.0.0.1. Secure Tunnel is required for public HTTPS."}
                  </div>
                </div>
              </div>
              {onNavigateToTunnel && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToTunnel();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-xs shrink-0 transition flex items-center gap-1"
                >
                  <Radio className="w-3 h-3" />
                  <span>{isZh ? "前往启用隧道" : "Open Tunnel"}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                <span className="text-theme-muted">{isZh ? "公网 MCP 端点" : "Public MCP Endpoint"}:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                  {publicTunnelEndpoint}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(publicTunnelEndpoint, "url")}
                className="text-[11px] px-2 py-1 rounded bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary shrink-0 transition flex items-center gap-1"
              >
                {copiedUrl ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copiedUrl ? (isZh ? "已复制" : "Copied") : (isZh ? "复制地址" : "Copy")}</span>
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 flex items-center gap-2 border-b border-theme-subtle text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("guide")}
            className={`pb-2.5 px-2 font-semibold border-b-2 transition ${
              activeTab === "guide"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-theme-muted hover:text-theme-primary"
            }`}
          >
            {isZh ? "1. 网页版安装指引" : "1. Web Installation"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("token")}
            className={`pb-2.5 px-2 font-semibold border-b-2 transition ${
              activeTab === "token"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-theme-muted hover:text-theme-primary"
            }`}
          >
            {isZh ? "2. 专属授权令牌" : "2. Dedicated Token"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("manifest")}
            className={`pb-2.5 px-2 font-semibold border-b-2 transition ${
              activeTab === "manifest"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-theme-muted hover:text-theme-primary"
            }`}
          >
            {isZh ? "3. 插件包与 Manifest" : "3. Plugin Package"}
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* TAB 1: GUIDE */}
          {activeTab === "guide" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-theme-card-muted border border-theme-subtle space-y-3">
                <div className="font-bold text-theme-primary text-sm">
                  {isZh ? "在 Kimi 网页版（kimi.com）中使用步骤" : "Steps to use on kimi.com"}
                </div>
                <ol className="space-y-2 text-theme-secondary list-decimal list-inside leading-relaxed">
                  <li>
                    {isZh ? "打开浏览器访问 " : "Open "}
                    <a
                      href="https://kimi.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-500 font-semibold underline inline-flex items-center gap-0.5"
                    >
                      kimi.com <ExternalLink className="w-3 h-3 inline" />
                    </a>
                    {isZh ? " 并登录账号。" : " in your browser and sign in."}
                  </li>
                  <li>
                    {isZh
                      ? "切换至支持插件的模型版本（如 K3 或 K3 Swarm）。"
                      : "Switch to a model mode that supports plugins (such as K3 or K3 Swarm)."}
                  </li>
                  <li>
                    {isZh
                      ? "在对话输入框旁点击 “+” 按钮或键盘输入 “/”。"
                      : "Click '+' next to the chat prompt or type '/'."}
                  </li>
                  <li>
                    {isZh
                      ? "点击打开「插件」菜单（或使用 Kimi Work Plugin Builder）。"
                      : "Open the 'Plugins' menu (or Kimi Work Plugin Builder)."}
                  </li>
                  <li>
                    {isZh
                      ? "安装/导入 Nexus 插件（可导入由 Nexus 导出的 kimi.plugin.json 清单）。"
                      : "Install/import Nexus plugin using the exported kimi.plugin.json."}
                  </li>
                  <li>
                    {isZh
                      ? "完成授权：输入下方标签页中生成的 Kimi Web 专属 Token。"
                      : "Authorize: Enter the dedicated Kimi Web Token generated in tab 2."}
                  </li>
                  <li>
                    {isZh
                      ? "在当前会话工具栏中选中启用 Nexus 插件。"
                      : "Select and enable Nexus plugin in your active chat session."}
                  </li>
                </ol>
              </div>

              <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-800 dark:text-sky-200 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-sky-500" />
                  <span>{isZh ? "官方插件机制提示" : "Official Plugin Mechanism Note"}</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {isZh
                    ? "Kimi 网页版官方支持插件机制中的 MCP 与 Skills。个人自定义插件通常在 Kimi Work Plugin Builder 中导入清单创建，请勿直接填写 localhost 地址。"
                    : "Kimi Web supports MCP via plugins. Custom plugins are imported via Kimi Work Plugin Builder. Do not use localhost URLs."}
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: TOKEN */}
          {activeTab === "token" && (
            <div className="space-y-4">
              {/* Scopes Selection */}
              <div className="space-y-2">
                <label className="text-theme-muted font-semibold block text-[11px]">
                  {isZh ? "Kimi Web 权限作用域 (Scopes)" : "Kimi Web Permission Scopes"}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="p-2.5 rounded-xl bg-theme-card-muted border border-theme-subtle flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scopes.includes("read")}
                      onChange={(e) => {
                        if (e.target.checked) setScopes([...scopes, "read"]);
                        else setScopes(scopes.filter((s) => s !== "read"));
                      }}
                      className="rounded border-theme-subtle text-sky-500"
                    />
                    <div>
                      <div className="font-bold text-xs">read (只读)</div>
                      <div className="text-[10px] text-theme-muted">浏览项目与读取代码</div>
                    </div>
                  </label>

                  <label className="p-2.5 rounded-xl bg-theme-card-muted border border-theme-subtle flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scopes.includes("write")}
                      onChange={(e) => {
                        if (e.target.checked) setScopes([...scopes, "write"]);
                        else setScopes(scopes.filter((s) => s !== "write"));
                      }}
                      className="rounded border-theme-subtle text-sky-500"
                    />
                    <div>
                      <div className="font-bold text-xs">write (写入)</div>
                      <div className="text-[10px] text-theme-muted">创建与编辑文件</div>
                    </div>
                  </label>

                  <label className="p-2.5 rounded-xl bg-theme-card-muted border border-theme-subtle flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scopes.includes("execute")}
                      onChange={(e) => {
                        if (e.target.checked) setScopes([...scopes, "execute"]);
                        else setScopes(scopes.filter((s) => s !== "execute"));
                      }}
                      className="rounded border-theme-subtle text-sky-500"
                    />
                    <div>
                      <div className="font-bold text-xs">execute (执行)</div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-400">运行测试与命令</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Dedicated Token Display / Generator */}
              <div className="p-4 rounded-xl bg-theme-card-muted border border-theme-subtle space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-sky-500" />
                    <span className="font-bold text-theme-primary">
                      {isZh ? "Kimi Web 专属访问令牌" : "Dedicated Kimi Web Token"}
                    </span>
                  </div>
                  <span className="text-[11px] text-theme-muted">
                    {hasToken ? (isZh ? "已生成专属令牌" : "Token Active") : (isZh ? "尚未授权" : "Unconfigured")}
                  </span>
                </div>

                {createdToken ? (
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 font-mono text-xs text-emerald-700 dark:text-emerald-300 break-all flex items-center justify-between gap-2">
                      <span className="font-bold">{createdToken}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(createdToken, "token")}
                        className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 shadow-xs"
                      >
                        {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      {isZh
                        ? "请立即复制此完整令牌，关闭后出于安全考虑将仅展示掩码。"
                        : "Copy this full token now; only masked token is displayed once closed."}
                    </p>
                  </div>
                ) : connection?.tokenMasked ? (
                  <div className="p-2.5 rounded-lg bg-theme-card border border-theme-subtle font-mono text-xs text-theme-secondary flex items-center justify-between">
                    <span>{connection.tokenMasked}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-theme-card-muted text-theme-muted">
                      {isZh ? "已持久化存储" : "Persisted"}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-theme-muted">
                    {isZh
                      ? "点击下方按钮为 Kimi Web 生成专属访问令牌。此令牌独立于其他客户端，不可混用。"
                      : "Generate a dedicated token for Kimi Web. This token is isolated from other clients."}
                  </p>
                )}

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateOrRotateToken}
                    disabled={isGeneratingToken || !isTunnelConnected}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingToken ? "animate-spin" : ""}`} />
                    <span>
                      {hasToken
                        ? (isZh ? "重新授权 / 轮换令牌" : "Rotate Token")
                        : (isZh ? "生成 Kimi Web 专属令牌" : "Generate Token")}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MANIFEST & EXPORT */}
          {activeTab === "manifest" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-theme-primary">
                    {isZh ? "Kimi 插件清单 (kimi.plugin.json)" : "Kimi Plugin Manifest"}
                  </div>
                  <div className="text-[11px] text-theme-muted">
                    {isZh
                      ? "此清单不包含明文密钥，可安全导出并导入至 Kimi Work Plugin Builder。"
                      : "Manifest contains no secrets and can be safely imported to Kimi Work Plugin Builder."}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        manifestData ? JSON.stringify(manifestData, null, 2) : "",
                        "manifest"
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary text-xs transition flex items-center gap-1"
                  >
                    {copiedManifest ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedManifest ? (isZh ? "已复制" : "Copied") : (isZh ? "复制 JSON" : "Copy JSON")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportPlugin}
                    disabled={isExporting}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isExporting ? (isZh ? "导出中..." : "Exporting...") : (isZh ? "导出插件包" : "Export Package")}</span>
                  </button>
                </div>
              </div>

              {exportSuccessPath && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isZh ? "插件包导出成功！" : "Plugin exported successfully!"}</span>
                  </div>
                  <div className="font-mono text-[11px] break-all">{exportSuccessPath}</div>
                </div>
              )}

              {/* Code viewer */}
              <pre className="p-4 rounded-xl bg-black/5 dark:bg-black/30 border border-theme-subtle font-mono text-[11px] text-theme-secondary overflow-x-auto max-h-60">
                {manifestData
                  ? JSON.stringify(manifestData, null, 2)
                  : `{\n  "schema_version": "v1",\n  "name_for_human": "Nexus",\n  "api": { "url": "${publicTunnelEndpoint}" }\n}`}
              </pre>
            </div>
          )}

          {/* Test Result Drawer */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                testResult.success
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
              }`}
            >
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
              <span className="font-mono text-[11px]">
                {testResult.latencyMs} ms · {testResult.toolCount} tools
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-theme-subtle flex items-center justify-between gap-3 bg-theme-card">
          <button
            type="button"
            onClick={handleRunTest}
            disabled={isTesting || !isTunnelConnected}
            className="px-3.5 py-2 rounded-xl text-xs font-medium bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? "animate-spin" : ""}`} />
            <span>{isTesting ? (isZh ? "测试中..." : "Testing...") : (isZh ? "测试 Remote MCP" : "Test Remote MCP")}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-theme-primary text-theme-inverse hover:opacity-90 transition shadow-sm"
          >
            {isZh ? "完成" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
};
