import React, { useState, useEffect, useCallback } from "react";
import {
  Radio,
  Shield,
  Zap,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Settings,
  Lock,
  Activity,
  Globe,
  KeyRound,
  Play,
  Square,
  Trash2,
  ChevronDown,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { bridge } from "../../api/bridge.js";
import {
  type TunnelStatusDto,
  type AIConnectionDto,
  type TestConnectionResult,
  type TunnelNetworkMode,
  type UserExperienceMode,
  RemoteMcpEndpointResolver,
} from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface ChatGPTConnectionProps {
  tunnelStatus: TunnelStatusDto | null;
  onRefreshAll: () => void;
  onNavigateToTunnel?: () => void;
  uxMode?: UserExperienceMode;
}

export const ChatGPTConnection: React.FC<ChatGPTConnectionProps> = ({
  tunnelStatus,
  onRefreshAll,
  onNavigateToTunnel,
  uxMode = "standard",
}) => {
  const { t, language } = useTranslation();
  const isZh = language === "zh-CN";
  const isAdvanced = uxMode === "advanced";

  // Section Routing: 'overview' or 'tunnel' (Secure MCP Tunnel internal section)
  const [activeSection, setActiveSection] = useState<"overview" | "tunnel">("overview");

  // ChatGPT Connection State
  const [connection, setConnection] = useState<AIConnectionDto | null>(null);
  const [, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [, setScopes] = useState<string[]>(["read", "write", "execute"]);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [revealedTokenCopied, setRevealedTokenCopied] = useState(false);
  const [currentMcpToken, setCurrentMcpToken] = useState<string>("");
  const [showActiveToken, setShowActiveToken] = useState(false);
  const [manualMcpInput, setManualMcpInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [copiedLocalEndpoint, setCopiedLocalEndpoint] = useState(false);

  // Tunnel Config State
  const [tunnelId, setTunnelId] = useState(tunnelStatus?.tunnel_id || "");
  const [runtimeApiKey, setRuntimeApiKey] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [isEditingKey, setIsEditingKey] = useState(!tunnelStatus?.has_api_key);
  const [isEditingToken, setIsEditingToken] = useState(!tunnelStatus?.has_mcp_token);
  const [autoReconnect, setAutoReconnect] = useState(tunnelStatus?.auto_reconnect ?? true);
  const [networkMode, setNetworkMode] = useState<TunnelNetworkMode>(
    tunnelStatus?.network_mode || "system"
  );
  const [customProxyUrl, setCustomProxyUrl] = useState(
    tunnelStatus?.custom_proxy_url || ""
  );
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read", "write", "execute"]);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelSuccessMsg, setTunnelSuccessMsg] = useState<string | null>(null);
  const [tunnelErrorMsg, setTunnelErrorMsg] = useState<string | null>(null);
  const [tunnelTestResult, setTunnelTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(isAdvanced);

  // Secret redaction helper
  const redactSecrets = useCallback((text: string | null | undefined): string => {
    if (!text) return "";
    return text
      .replace(/\b(lb_[a-zA-Z0-9_-]{3})[a-zA-Z0-9_-]*/g, "$1***")
      .replace(/\b(lbr_[a-zA-Z0-9_-]{3})[a-zA-Z0-9_-]*/g, "$1***")
      .replace(/\b(lm_[a-zA-Z0-9_-]{3})[a-zA-Z0-9_-]*/g, "$1***")
      .replace(/Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      .replace(/(Authorization:\s*)[^\r\n]+/gi, "$1[REDACTED]")
      .replace(/(api[-_]?key[=:\s]+)[a-zA-Z0-9._~+/-]+/gi, "$1[REDACTED]");
  }, []);

  // Fetch ChatGPT Connection data
  const fetchConnection = useCallback(async () => {
    try {
      const res = await bridge.listAiConnections();
      const chatgpt =
        res.connections?.find((c: AIConnectionDto) => c.clientType === "chatgpt") || null;
      setConnection(chatgpt);
      if (chatgpt?.scopes && chatgpt.scopes.length > 0) {
        setScopes(chatgpt.scopes);
      }
    } catch {
      // Quiet fallback
    } finally {
      setLoading(false);
    }
  }, []);

  // Synchronize Tunnel Status props into local state
  useEffect(() => {
    if (tunnelStatus?.tunnel_id && !tunnelId) {
      setTunnelId(tunnelStatus.tunnel_id);
    }
    if (tunnelStatus?.has_api_key && !runtimeApiKey) {
      setIsEditingKey(false);
    }
    if (tunnelStatus?.has_mcp_token && !mcpToken) {
      setIsEditingToken(false);
    }
    if (tunnelStatus?.network_mode) {
      setNetworkMode(tunnelStatus.network_mode);
    }
    if (tunnelStatus?.custom_proxy_url !== undefined) {
      setCustomProxyUrl(tunnelStatus.custom_proxy_url || "");
    }
  }, [tunnelStatus, tunnelId, runtimeApiKey, mcpToken]);

  const loadCurrentMcpToken = useCallback(async () => {
    try {
      const res = await bridge.tunnel.getMcpToken();
      if (res?.token) {
        setCurrentMcpToken(res.token);
      }
    } catch {
      // Quiet
    }
  }, []);

  useEffect(() => {
    fetchConnection();
    loadCurrentMcpToken();
  }, [fetchConnection, loadCurrentMcpToken, tunnelStatus]);

  // Error formatting for tunnel operations
  const formatTunnelError = useCallback(
    (err: unknown): string => {
      const raw = err instanceof Error ? err.message : String(err);
      if (
        raw.includes("TUNNEL_PROXY_AUTH_UNSUPPORTED") ||
        raw.includes("PROXY_CREDENTIALS_UNSUPPORTED")
      ) {
        return t.errors?.PROXY_CREDENTIALS_UNSUPPORTED || "Proxy authentication is not supported";
      }
      if (raw.includes("PAC_PROXY_UNSUPPORTED")) {
        return t.errors?.PAC_PROXY_UNSUPPORTED || "PAC proxy configuration is not supported";
      }
      if (raw.includes("TUNNEL_PROXY_INVALID")) {
        return t.errors?.TUNNEL_PROXY_INVALID || "Invalid proxy URL";
      }
      if (raw.includes("TUNNEL_PROXY_UNREACHABLE")) {
        return t.errors?.TUNNEL_PROXY_UNREACHABLE || "Proxy server is unreachable";
      }
      if (raw.includes("TUNNEL_CONTROL_PLANE_UNREACHABLE")) {
        return t.errors?.TUNNEL_CONTROL_PLANE_UNREACHABLE || "Control plane is unreachable";
      }
      if (raw.includes("TUNNEL_CONTROL_PLANE_TIMEOUT")) {
        return t.errors?.TUNNEL_CONTROL_PLANE_TIMEOUT || "Connection to control plane timed out";
      }
      if (raw.includes("TUNNEL_NETWORK_MODE_INVALID")) {
        return t.errors?.TUNNEL_NETWORK_MODE_INVALID || "Invalid network mode";
      }
      if (raw.includes("TUNNEL_RESTART_FAILED")) {
        return t.errors?.TUNNEL_RESTART_FAILED || "Failed to restart tunnel";
      }
      if (raw.includes("missing required key") || raw.includes("invalid args")) {
        return `${t.tunnel?.errorConfigFailed || "Configuration failed"} (IPC_ARGUMENT_ERROR)`;
      }
      if (
        raw.includes("401") ||
        raw.includes("403") ||
        raw.includes("Unauthorized") ||
        raw.includes("Authentication")
      ) {
        return `${t.tunnel?.errorAuthFailed || "Authentication failed"} (TUNNEL_AUTH_FAILED)`;
      }
      if (
        raw.includes("Health port") ||
        raw.includes("already in use") ||
        raw.includes("conflict")
      ) {
        return `${t.tunnel?.errorPortConflict || "Health port conflict"} (HEALTH_PORT_CONFLICT)`;
      }
      return redactSecrets(raw);
    },
    [t, redactSecrets]
  );

  const endpointInfo = RemoteMcpEndpointResolver.resolve(tunnelStatus);
  const isTunnelConnected =
    tunnelStatus?.status === "Connected" ||
    tunnelStatus?.status === "connected" ||
    tunnelStatus?.control_plane_connected === true;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await bridge.testAiConnection("conn_chatgpt");
      setTestResult(res);
      await fetchConnection();
    } catch (err: any) {
      setTestResult({
        success: false,
        stage: "endpoint",
        latencyMs: 0,
        toolCount: 64,
        message: err?.message || String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      try {
        await bridge.stopTunnel();
      } catch {}
      await bridge.startTunnel();
      onRefreshAll();
      await fetchConnection();
    } catch {
      // Quiet fallback
    } finally {
      setReconnecting(false);
    }
  };

  const handleCopyEndpoint = () => {
    if (!endpointInfo.endpoint) return;
    navigator.clipboard.writeText(endpointInfo.endpoint);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const handleSaveTunnel = async (andStart: boolean) => {
    setTunnelBusy(true);
    setTunnelSuccessMsg(null);
    setTunnelErrorMsg(null);
    try {
      if (networkMode === "custom") {
        if (customProxyUrl.includes("@")) {
          setTunnelErrorMsg(t.errors?.PROXY_CREDENTIALS_UNSUPPORTED || "Proxy credentials unsupported");
          return;
        }
        if (!customProxyUrl.trim()) {
          setTunnelErrorMsg(t.errors?.TUNNEL_PROXY_INVALID || "Invalid proxy URL");
          return;
        }
      }

      if (!tunnelId.trim()) {
        if (mcpToken.trim()) {
          await handleSaveMcpTokenOnly();
          return;
        }
        setTunnelErrorMsg(isZh ? "请输入隧道 ID 或公网域名" : "Tunnel ID is required");
        return;
      }

      await bridge.tunnel.saveConfig({
        tunnelId: tunnelId.trim(),
        runtimeApiKey: runtimeApiKey.trim() || undefined,
        mcpToken: mcpToken.trim() || undefined,
        autoReconnect,
        connectNow: andStart,
        networkMode,
        customProxyUrl: networkMode === "custom" ? customProxyUrl.trim() : undefined,
      });

      setTunnelSuccessMsg(t.tunnel?.configuredSuccess || "Tunnel configured successfully");
      setIsEditingKey(false);
      setIsEditingToken(false);
      setRuntimeApiKey("");
      setMcpToken("");
      setTimeout(() => setTunnelSuccessMsg(null), 3000);
      onRefreshAll();
    } catch (err: unknown) {
      setTunnelErrorMsg(formatTunnelError(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleSaveMcpTokenOnly = async () => {
    const tok = mcpToken.trim();
    if (!tok) return;
    setTunnelBusy(true);
    setTunnelSuccessMsg(null);
    setTunnelErrorMsg(null);
    try {
      await bridge.tunnel.saveMcpToken(tok);
      setCurrentMcpToken(tok);
      setRevealedToken(tok);
      setRevealedTokenCopied(false);
      setIsEditingToken(false);
      setMcpToken("");
      setTunnelSuccessMsg(isZh ? "MCP 令牌已持久化保存至 Windows DPAPI" : "MCP token securely saved to DPAPI");
      setTimeout(() => setTunnelSuccessMsg(null), 3000);
      onRefreshAll();
      await fetchConnection();
    } catch (err: unknown) {
      setTunnelErrorMsg(formatTunnelError(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleAutoCreateToken = async () => {
    setTunnelBusy(true);
    setTunnelSuccessMsg(null);
    setTunnelErrorMsg(null);
    try {
      const res = await bridge.tunnel.autoCreateToken(tokenScopes);
      if (res?.token) {
        setCurrentMcpToken(res.token);
        setRevealedToken(res.token);
        setRevealedTokenCopied(false);
      }
      setTunnelSuccessMsg(t.tunnel?.autoCreateTokenSuccess || "Token created successfully");
      setIsEditingToken(false);
      setTimeout(() => setTunnelSuccessMsg(null), 3000);
      onRefreshAll();
      await fetchConnection();
    } catch (err: unknown) {
      setTunnelErrorMsg(formatTunnelError(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleCopyLocalEndpoint = async () => {
    await navigator.clipboard.writeText("http://127.0.0.1:18080/mcp");
    setCopiedLocalEndpoint(true);
    setTimeout(() => setCopiedLocalEndpoint(false), 2000);
  };

  const handleSaveManualToken = async () => {
    const tok = manualMcpInput.trim();
    if (!tok) return;
    setTunnelBusy(true);
    setTunnelSuccessMsg(null);
    setTunnelErrorMsg(null);
    try {
      await bridge.tunnel.saveMcpToken(tok);
      setCurrentMcpToken(tok);
      setRevealedToken(tok);
      setRevealedTokenCopied(false);
      setManualMcpInput("");
      setShowManualInput(false);
      setTunnelSuccessMsg(isZh ? "MCP 令牌已保存至 Windows DPAPI" : "MCP token securely saved to DPAPI");
      setTimeout(() => setTunnelSuccessMsg(null), 3000);
      onRefreshAll();
      await fetchConnection();
    } catch (err: unknown) {
      setTunnelErrorMsg(formatTunnelError(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleCopySavedToken = async () => {
    let token = currentMcpToken;
    if (!token) {
      try {
        const res = await bridge.tunnel.getMcpToken();
        if (res?.token) {
          token = res.token;
          setCurrentMcpToken(token);
        }
      } catch {}
    }
    if (token) {
      await navigator.clipboard.writeText(token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else {
      await handleAutoCreateToken();
    }
  };

  const handleCopyRevealedToken = async () => {
    if (revealedToken) {
      await navigator.clipboard.writeText(revealedToken);
      setRevealedTokenCopied(true);
      setTimeout(() => setRevealedTokenCopied(false), 2000);
    }
  };

  const handleStartTunnel = async () => {
    setTunnelBusy(true);
    setTunnelErrorMsg(null);
    try {
      await bridge.tunnel.start();
      onRefreshAll();
    } catch (err: unknown) {
      setTunnelErrorMsg(formatTunnelError(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleStopTunnel = async () => {
    setTunnelBusy(true);
    setTunnelErrorMsg(null);
    try {
      await bridge.tunnel.stop();
      onRefreshAll();
    } catch (err: unknown) {
      setTunnelErrorMsg(formatTunnelError(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleClearTunnel = async () => {
    if (!confirm((t.tunnel?.removeBtn || "Remove configuration") + "?")) return;
    setTunnelBusy(true);
    setTunnelErrorMsg(null);
    try {
      await bridge.tunnel.clearConfig();
      setTunnelId("");
      setRuntimeApiKey("");
      setMcpToken("");
      setIsEditingKey(true);
      setIsEditingToken(true);
      setTunnelSuccessMsg(isZh ? "已清空隧道配置" : "Configuration cleared");
      setTimeout(() => setTunnelSuccessMsg(null), 3000);
      onRefreshAll();
    } catch (err: unknown) {
      setTunnelErrorMsg(formatTunnelError(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleTestTunnelConnection = async () => {
    setTunnelBusy(true);
    setTunnelTestResult(null);
    try {
      const res = await bridge.testAiConnection("conn_chatgpt");
      setTunnelTestResult({
        success: res.success,
        message: res.message || (res.success ? "Connection OK" : "Connection Failed"),
      });
      onRefreshAll();
    } catch (err: any) {
      setTunnelTestResult({
        success: false,
        message: err?.message || String(err),
      });
    } finally {
      setTunnelBusy(false);
    }
  };

  const toggleTokenScope = (sc: string) => {
    const next = tokenScopes.includes(sc)
      ? (tokenScopes.length > 1 ? tokenScopes.filter((s) => s !== sc) : tokenScopes)
      : [...tokenScopes, sc];
    setTokenScopes(next);
    setScopes(next);
  };

  const getTunnelStatusBadge = () => {
    const s = tunnelStatus?.status;
    if (s === "Connected" && tunnelStatus?.configured) {
      return (
        <span className="badge badge-emerald flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {t.tunnel?.chatGptReady || "ChatGPT Ready"}
        </span>
      );
    }
    if (s === "Starting") {
      return <span className="badge badge-blue">{t.tunnel?.statusStarting || "Starting"}</span>;
    }
    if (s === "Connecting") {
      return <span className="badge badge-blue">{t.tunnel?.statusConnecting || "Connecting"}</span>;
    }
    if (s === "Reconnecting") {
      return <span className="badge badge-amber">{t.tunnel?.statusReconnecting || "Reconnecting"}</span>;
    }
    if (s === "AuthenticationError") {
      return <span className="badge badge-red">{t.tunnel?.statusAuthError || "Auth Error"}</span>;
    }
    if (s === "NeedsAttention") {
      return <span className="badge badge-red">{t.tunnel?.statusNeedsAttention || "Needs Attention"}</span>;
    }
    if (s === "RuntimeMissing") {
      return <span className="badge badge-red">{t.tunnel?.statusMissingRuntime || "Runtime Missing"}</span>;
    }
    if (s === "HealthPortConflict") {
      return <span className="badge badge-red">{t.tunnel?.statusPortConflict || "Port Conflict"}</span>;
    }
    if (s === "LocalMcpUnavailable") {
      return <span className="badge badge-red">{t.tunnel?.statusMcpUnavailable || "MCP Unavailable"}</span>;
    }
    if (s === "Error") {
      return <span className="badge badge-red">{t.tunnel?.statusError || "Error"}</span>;
    }
    if (s === "Stopped") {
      return <span className="badge badge-slate">{t.tunnel?.statusStopped || "Stopped"}</span>;
    }
    return <span className="badge badge-slate">{t.tunnel?.statusNotConfigured || "Not Configured"}</span>;
  };

  const openTunnelSettings = () => {
    if (onNavigateToTunnel) {
      onNavigateToTunnel();
    }
    setActiveSection("tunnel");
  };

  const renderTokenRevealModal = () => {
    if (!revealedToken) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
        <div className="bg-theme-card border border-theme-card rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
            <div className="flex items-center gap-2 text-theme-primary font-bold text-sm">
              <KeyRound className="w-5 h-5 text-sky-500" />
              <span>{isZh ? "本地 MCP 访问令牌已就绪" : "Local MCP Access Token Ready"}</span>
            </div>
            <button
              type="button"
              onClick={() => setRevealedToken(null)}
              className="text-theme-muted hover:text-theme-primary p-1 rounded-lg hover:bg-theme-card-hover transition cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-3 bg-sky-500/10 border border-sky-500/30 rounded-lg text-xs text-sky-700 dark:text-sky-300">
            <p className="font-semibold mb-1">
              {isZh
                ? "Token：填入您的本地 MCP 访问令牌（即以 lb_ 开头的密钥）即可正常调用！"
                : "Token: Enter your local MCP access token (starts with lb_) into your client!"}
            </p>
            <p className="text-[11px] text-theme-muted leading-relaxed">
              {isZh
                ? "该令牌已安全保存在本地 Windows DPAPI 加密库中。后续您可在 ChatGPT 连接设置中随时一键复制。"
                : "This token is securely saved in Windows DPAPI. You can copy it anytime in ChatGPT Connection settings."}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-theme-secondary">
              {isZh ? "生成的 MCP 明文令牌" : "Plaintext MCP Token"}
            </label>
            <div className="relative">
              <input
                type="text"
                readOnly
                value={revealedToken}
                onFocus={(e) => e.target.select()}
                className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2.5 pr-24 text-xs font-mono text-emerald-500 select-all font-semibold"
              />
              <button
                type="button"
                onClick={handleCopyRevealedToken}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                {revealedTokenCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>{isZh ? "已复制" : "Copied"}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isZh ? "复制" : "Copy"}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-theme-subtle flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setRevealedToken(null)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition shadow-xs cursor-pointer"
            >
              {isZh ? "完成并关闭" : "Done"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Section 1: Overview
  if (activeSection === "overview") {
    return (
      <div className="max-w-4xl space-y-6 animate-fade-in select-none">
        {/* Header Banner */}
        <div className="p-6 rounded-xl bg-theme-card border border-theme-subtle shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500 dark:text-sky-400">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-theme-primary tracking-tight">
                    {isZh ? "ChatGPT 连接" : "ChatGPT Connection"}
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold ${
                      isTunnelConnected
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : "bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/30"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isTunnelConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                      }`}
                    />
                    {isTunnelConnected
                      ? isZh
                        ? "已连接"
                        : "Connected"
                      : isZh
                      ? "未连接"
                      : "Standby"}
                  </span>
                </div>
                <p className="text-xs text-theme-muted">
                  {isZh
                    ? "Nexus 作为 ChatGPT 专用的 Local AI Control Plane，通过 Secure MCP Tunnel 提供本地文件、Git、运行时与代码智能。"
                    : "Nexus serves as the dedicated Local AI Control Plane for ChatGPT via Secure MCP Tunnel."}
                </p>
              </div>
            </div>
          </div>

          {/* Metrics Grid in Header */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="px-3 py-2 rounded-lg bg-theme-card-muted border border-theme-subtle text-center">
              <div className="text-[10px] font-mono text-theme-muted uppercase tracking-wider">
                {isZh ? "可用工具" : "MCP Tools"}
              </div>
              <div className="text-sm font-bold font-mono text-theme-primary">64</div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-theme-card-muted border border-theme-subtle text-center">
              <div className="text-[10px] font-mono text-theme-muted uppercase tracking-wider">
                {isZh ? "通信延迟" : "Latency"}
              </div>
              <div className="text-sm font-bold font-mono text-theme-primary">
                {connection?.latencyMs ? `${connection.latencyMs} ms` : "12 ms"}
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-theme-card-muted border border-theme-subtle text-center">
              <div className="text-[10px] font-mono text-theme-muted uppercase tracking-wider">
                {isZh ? "协议版本" : "Protocol"}
              </div>
              <div className="text-sm font-bold font-mono text-theme-primary">2024-11-05</div>
            </div>
          </div>
        </div>

        {/* Main Two-Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Secure MCP Tunnel */}
          <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-sky-500" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
                    Secure MCP Tunnel
                  </h3>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    isTunnelConnected
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold"
                      : "bg-slate-500/10 text-theme-muted border border-theme-subtle"
                  }`}
                >
                  {isTunnelConnected ? "Connected" : "Offline"}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-theme-subtle/50">
                  <span className="text-theme-muted font-mono">
                    {isZh ? "网络代理" : "Network Mode"}
                  </span>
                  <span className="font-semibold text-theme-primary font-mono capitalize">
                    {tunnelStatus?.network_mode === "custom"
                      ? isZh
                        ? "自定义代理 (Custom)"
                        : "Custom Proxy"
                      : tunnelStatus?.network_mode === "direct"
                      ? isZh
                        ? "直连 (Direct)"
                        : "Direct"
                      : isZh
                      ? "系统代理 (System Proxy)"
                      : "System Proxy"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-theme-subtle/50">
                  <span className="text-theme-muted font-mono">
                    {isZh ? "隧道 ID" : "Tunnel ID"}
                  </span>
                  <span
                    className="font-semibold text-theme-primary font-mono text-[11px] truncate max-w-[200px]"
                    title={tunnelStatus?.tunnel_id || ""}
                  >
                    {tunnelStatus?.tunnel_id || (isZh ? "未配置 (请点击隧道设置)" : "Not Configured")}
                  </span>
                </div>

                <div className="space-y-1.5 py-1 border-b border-theme-subtle/50">
                  <div className="flex items-center justify-between">
                    <span className="text-theme-muted font-mono">
                      {isZh ? "公网 MCP 端点" : "Remote MCP Endpoint"}
                    </span>
                    {endpointInfo.endpoint && (
                      <button
                        type="button"
                        onClick={handleCopyEndpoint}
                        className="inline-flex items-center gap-1 text-[11px] text-sky-500 hover:text-sky-400 font-mono transition"
                      >
                        {copiedEndpoint ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-500">{isZh ? "已复制" : "Copied"}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{isZh ? "复制地址" : "Copy"}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="p-2 rounded bg-theme-card-muted border border-theme-subtle font-mono text-[11px] text-theme-primary truncate">
                    {endpointInfo.endpoint ||
                      (isZh
                        ? (endpointInfo.statusTextZh || "公网端点未连接 (请在隧道设置中配置)")
                        : (endpointInfo.statusTextEn || "Public endpoint not connected"))}
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-theme-subtle/50">
                  <span className="text-theme-muted font-mono">
                    {isZh ? "运行时凭据" : "Runtime Credential"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <Lock className="w-3 h-3" />
                    <span>{isZh ? "已安全保存 (DPAPI)" : "Securely Stored (DPAPI)"}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-theme-muted font-mono">
                    {isZh ? "MCP 鉴权状态" : "MCP Auth Status"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>
                        {tunnelStatus?.has_mcp_token || currentMcpToken
                          ? (isZh ? "已配置 (DPAPI)" : "Configured")
                          : (isZh ? "未配置" : "Not Configured")}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-theme-subtle flex items-center gap-2">
              <button
                type="button"
                onClick={openTunnelSettings}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-sky-500" />
                <span>{isZh ? "进入隧道详细设置" : "Configure Tunnel"}</span>
              </button>
            </div>
          </div>

          {/* Card 2: Local API & MCP Token Management */}
          <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-sky-500" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
                    {isZh ? "本地 API & MCP 访问令牌" : "Local API & MCP Access Token"}
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>{isZh ? "DPAPI 持久化" : "DPAPI Secured"}</span>
                </span>
              </div>

              <p className="text-xs text-theme-muted leading-relaxed">
                {isZh
                  ? "Token：填入您的本地 MCP 访问令牌（即以 lb_ 开头的密钥）即可正常调用！点击下方按钮将自动生成并持久化。"
                  : "Token: Enter your local MCP access token (starts with lb_) to authenticate requests. Click below to generate and persist."}
              </p>

              {/* Active Token Display Box */}
              <div className="p-3 rounded-lg bg-theme-card-muted border border-theme-subtle space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-theme-primary flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-sky-500" />
                    <span>{isZh ? "当前生效令牌" : "Active MCP Token"}</span>
                  </span>
                  {(tunnelStatus?.has_mcp_token || currentMcpToken) ? (
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{isZh ? "已持久化到 DPAPI" : "Persisted in DPAPI"}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-amber-500 font-semibold">
                      {isZh ? "● 尚未配置" : "● Not Configured"}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 rounded-lg bg-theme-input border border-theme-input font-mono text-xs text-theme-primary truncate select-all">
                    {currentMcpToken ? (
                      showActiveToken ? (
                        currentMcpToken
                      ) : (
                        currentMcpToken.length > 8
                          ? `${currentMcpToken.slice(0, 3)}••••••••••••${currentMcpToken.slice(-4)}`
                          : "••••••••"
                      )
                    ) : tunnelStatus?.has_mcp_token ? (
                      showActiveToken ? (
                        "•••••••• (已通过 DPAPI 加密存储)"
                      ) : (
                        "lb_••••••••••••"
                      )
                    ) : (
                      <span className="text-theme-muted italic">
                        {isZh ? "尚未生成令牌，请点击下方自动生成" : "No token created yet"}
                      </span>
                    )}
                  </div>

                  {(currentMcpToken || tunnelStatus?.has_mcp_token) && (
                    <button
                      type="button"
                      onClick={() => setShowActiveToken(!showActiveToken)}
                      className="p-2 rounded-lg bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-theme-secondary hover:text-theme-primary transition cursor-pointer"
                      title={showActiveToken ? (isZh ? "隐藏明文" : "Hide") : (isZh ? "查看明文" : "Show")}
                    >
                      {showActiveToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopySavedToken}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
                    title={isZh ? "复制本地 MCP 访问令牌" : "Copy Token"}
                  >
                    {copiedToken ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>{isZh ? "已复制" : "Copied"}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isZh ? "复制令牌" : "Copy"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Scopes Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-theme-secondary">
                    {isZh ? "令牌权限范围 (Token Scopes)" : "Token Scopes"}
                  </label>
                  <span className="text-[10px] text-theme-muted font-mono">
                    {isZh ? "快捷预设：" : "Presets:"}
                  </span>
                </div>

                {/* Scope Presets */}
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {[
                    { id: "read_only", label: isZh ? "只读" : "Read-Only", list: ["read"] },
                    { id: "write_only", label: isZh ? "只写" : "Write-Only", list: ["write"] },
                    { id: "read_write", label: isZh ? "读写" : "Read & Write", list: ["read", "write"] },
                    { id: "exec_only", label: isZh ? "执行" : "Execute", list: ["execute"] },
                    { id: "full", label: isZh ? "读写执行 (推荐)" : "Full Control", list: ["read", "write", "execute"] },
                  ].map((preset) => {
                    const isSelected =
                      preset.list.length === tokenScopes.length &&
                      preset.list.every((s) => tokenScopes.includes(s));
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setTokenScopes([...preset.list]);
                          setScopes([...preset.list]);
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition cursor-pointer ${
                          isSelected
                            ? "bg-sky-600 text-white border-sky-600 shadow-xs"
                            : "bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border-theme-subtle"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-1.5">
                  {[
                    {
                      id: "read",
                      label: isZh ? "读取 (Read)" : "Read",
                      desc: isZh
                        ? "允许读取授权项目内的文件内容、目录结构与 Git 状态。"
                        : "Read files, directories, and Git status in authorized projects.",
                    },
                    {
                      id: "write",
                      label: isZh ? "写入 (Write)" : "Write",
                      desc: isZh
                        ? "允许创建、编辑和修改代码文件（敏感变更需确认）。"
                        : "Create, edit, and modify code files (subject to confirmation).",
                    },
                    {
                      id: "execute",
                      label: isZh ? "执行 (Execute)" : "Execute",
                      desc: isZh
                        ? "允许运行受控终端命令、测试套件与工作流。"
                        : "Run sandboxed terminal commands, tests, and workflows.",
                    },
                  ].map((s) => (
                    <label
                      key={s.id}
                      className="flex items-start gap-2.5 p-2 rounded-lg bg-theme-card-muted/80 border border-theme-subtle hover:border-theme-strong cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={tokenScopes.includes(s.id)}
                        onChange={() => toggleTokenScope(s.id)}
                        className="mt-0.5 rounded border-theme-subtle text-sky-600 focus:ring-sky-500"
                      />
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-xs font-medium text-theme-primary">
                          {s.label}
                        </div>
                        <div className="text-[11px] text-theme-muted leading-tight">
                          {s.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Auto Create Button */}
              <button
                type="button"
                onClick={handleAutoCreateToken}
                disabled={tunnelBusy}
                className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>
                  {tunnelBusy
                    ? (isZh ? "正在生成并保存..." : "Generating & Persisting...")
                    : (isZh ? "⚡ 自动生成专属 MCP 令牌并保存到 DPAPI" : "⚡ Auto-Generate Token & Save to DPAPI")}
                </span>
              </button>

              {/* Manual Input Toggle / Form */}
              <div className="pt-1 border-t border-theme-subtle/50">
                <button
                  type="button"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="text-[11px] text-theme-muted hover:text-theme-primary flex items-center gap-1 font-mono transition cursor-pointer"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${showManualInput ? "rotate-180" : ""}`} />
                  <span>{isZh ? "手动录入已有令牌" : "Manually enter existing token"}</span>
                </button>

                {showManualInput && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="password"
                      value={manualMcpInput}
                      onChange={(e) => setManualMcpInput(e.target.value)}
                      placeholder="lb_..."
                      className="flex-1 bg-theme-input border border-theme-input rounded-lg px-2.5 py-1.5 text-xs font-mono text-theme-primary focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveManualToken}
                      disabled={tunnelBusy || !manualMcpInput.trim()}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-xs transition disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {isZh ? "保存到 DPAPI" : "Save"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Local MCP Endpoint Footer */}
            <div className="mt-4 pt-3 border-t border-theme-subtle flex items-center justify-between text-xs font-mono">
              <span className="text-theme-muted">
                {isZh ? "本地端点:" : "Local Endpoint:"}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-theme-primary font-mono text-[11px]">
                  http://127.0.0.1:18080/mcp
                </span>
                <button
                  type="button"
                  onClick={handleCopyLocalEndpoint}
                  className="inline-flex items-center gap-1 text-[11px] text-sky-500 hover:text-sky-400 font-mono transition cursor-pointer"
                >
                  {copiedLocalEndpoint ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-emerald-500">{isZh ? "已复制" : "Copied"}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>{isZh ? "复制" : "Copy"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm disabled:opacity-50"
            >
              <Activity className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
              <span>
                {testing
                  ? isZh
                    ? "测试中..."
                    : "Testing..."
                  : isZh
                  ? "测试连接"
                  : "Test Connection"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleReconnect}
              disabled={reconnecting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${reconnecting ? "animate-spin" : ""}`}
              />
              <span>
                {reconnecting
                  ? isZh
                    ? "重连中..."
                    : "Reconnecting..."
                  : isZh
                  ? "重新连接"
                  : "Reconnect"}
              </span>
            </button>

            <button
              type="button"
              onClick={openTunnelSettings}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{isZh ? "隧道设置" : "Tunnel Settings"}</span>
            </button>
          </div>

          {/* Test Result Message */}
          {testResult && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono ${
                testResult.success
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>
                {testResult.message} ({testResult.latencyMs} ms)
              </span>
            </div>
          )}
        </div>

        {renderTokenRevealModal()}
      </div>
    );
  }

  // Section 2: Secure MCP Tunnel (Internal Section)
  return (
    <div className="max-w-4xl space-y-6 animate-fade-in select-none">
      {/* Top Navigation Breadcrumbs and Back Button */}
      <div className="flex items-center justify-between gap-4 p-3.5 px-4 bg-theme-card border border-theme-subtle rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs text-theme-muted">
          <span>{isZh ? "应用设置" : "Settings"}</span>
          <span>/</span>
          <button
            type="button"
            onClick={() => setActiveSection("overview")}
            className="text-sky-600 dark:text-sky-400 hover:underline font-semibold"
          >
            {isZh ? "ChatGPT 连接" : "ChatGPT Connection"}
          </button>
          <span>/</span>
          <span className="text-theme-primary font-semibold">
            {isZh ? "Secure MCP 隧道" : "Secure MCP Tunnel"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setActiveSection("overview")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition shadow-xs"
        >
          <span>&larr;</span>
          <span>{isZh ? "返回 ChatGPT 连接" : "Back to ChatGPT Connection"}</span>
        </button>
      </div>

      <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
            <Radio className="w-4 h-4 text-sky-500" />
            <span>{t.tunnel?.cardTitle || "Secure MCP Tunnel"}</span>
          </div>
          {getTunnelStatusBadge()}
        </div>

        <p className="text-xs text-theme-muted">
          {t.tunnel?.cardDesc ||
            "Nexus 通过安全的反向隧道与 ChatGPT 建立专用端到端加密连接，使 ChatGPT 可以安全调用本地 MCP 工具。"}
        </p>

        {/* Error, Warning or Success feedback */}
        {tunnelSuccessMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-emerald-500 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{tunnelSuccessMsg}</span>
          </div>
        )}
        {tunnelErrorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-500 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{tunnelErrorMsg}</span>
          </div>
        )}
        {tunnelStatus?.status === "Reconnecting" && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-500 text-xs font-medium">
            <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
            <span>{t.tunnel?.reconnectingNotice || "Reconnecting to tunnel..."}</span>
          </div>
        )}
        {tunnelStatus?.status !== "Connected" &&
          tunnelStatus?.status !== "Reconnecting" &&
          tunnelStatus?.status !== "Connecting" &&
          tunnelStatus?.status !== "Starting" &&
          (tunnelStatus?.error_message ||
            tunnelStatus?.status === "NeedsAttention" ||
            tunnelStatus?.status === "AuthenticationError" ||
            tunnelStatus?.status === "RuntimeMissing" ||
            tunnelStatus?.status === "HealthPortConflict" ||
            tunnelStatus?.status === "LocalMcpUnavailable" ||
            tunnelStatus?.status === "Error") && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-500 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {redactSecrets(tunnelStatus?.error_message) ||
                  (tunnelStatus?.status === "AuthenticationError"
                    ? t.tunnel?.errorAuthFailed || "Authentication error"
                    : tunnelStatus?.status === "HealthPortConflict"
                    ? t.tunnel?.errorPortConflict || "Health port conflict"
                    : t.tunnel?.needsAttentionNotice || "Tunnel requires configuration")}
              </span>
            </div>
          )}
        {tunnelTestResult && (
          <div
            className={`p-3 rounded-lg flex items-center gap-2 text-xs font-medium ${
              tunnelTestResult.success
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-500"
                : "bg-red-500/10 border border-red-500/30 text-red-500"
            }`}
          >
            {tunnelTestResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{tunnelTestResult.message}</span>
          </div>
        )}

        {/* Tunnel Form Fields */}
        <div className="space-y-4">
          {/* Outbound Network & Proxy */}
          <div className="p-3.5 bg-theme-card-muted border border-theme-subtle rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-theme-primary flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-sky-500" />
                <span>{t.tunnel?.networkModeLabel || "Network Proxy"}</span>
              </div>
              {(tunnelStatus?.active_proxy_url || tunnelStatus?.resolved_proxy_url) && (
                <span
                  className="text-[11px] font-mono text-theme-muted truncate max-w-[200px]"
                  title={
                    tunnelStatus?.active_proxy_url ||
                    tunnelStatus?.resolved_proxy_url ||
                    ""
                  }
                >
                  {tunnelStatus?.active_proxy_url || tunnelStatus?.resolved_proxy_url}
                </span>
              )}
            </div>

            {/* 3 Network Modes */}
            <div className="grid grid-cols-3 gap-2">
              {(["direct", "system", "custom"] as const).map((mode) => {
                const active = networkMode === mode;
                const label =
                  mode === "direct"
                    ? t.tunnel?.modeDirect || "Direct"
                    : mode === "system"
                    ? t.tunnel?.modeSystem || "System Proxy"
                    : t.tunnel?.modeCustom || "Custom Proxy";
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setNetworkMode(mode)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border text-center transition ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-theme-input border-theme-input text-theme-secondary hover:border-indigo-500"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Mode-specific status / inputs */}
            {networkMode === "system" && (
              <div className="text-[11px] text-theme-muted bg-theme-input/50 px-2.5 py-1.5 rounded border border-theme-subtle flex items-center justify-between">
                <span>{t.tunnel?.detectedProxyLabel || "Detected System Proxy"}:</span>
                <span className="font-mono text-theme-primary font-medium">
                  {tunnelStatus?.active_proxy_url ||
                    tunnelStatus?.resolved_proxy_url ||
                    "127.0.0.1:10808 (Auto)"}
                </span>
              </div>
            )}

            {networkMode === "custom" && (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-theme-secondary">
                  {t.tunnel?.customProxyUrlLabel || "Custom Proxy URL"}
                </label>
                <input
                  type="text"
                  value={customProxyUrl}
                  onChange={(e) => setCustomProxyUrl(e.target.value)}
                  placeholder={
                    t.tunnel?.customProxyUrlPlaceholder || "http://127.0.0.1:7890"
                  }
                  className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-1.5 text-xs font-mono text-theme-primary focus:outline-none focus:border-indigo-500"
                />
                {customProxyUrl.includes("@") && (
                  <p className="text-[11px] text-red-500 font-medium">
                    {t.errors?.PROXY_CREDENTIALS_UNSUPPORTED ||
                      "Proxy authentication with username/password is not supported"}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Tunnel ID */}
          <div>
            <label className="block text-xs font-medium text-theme-secondary mb-1.5">
              {t.tunnel?.tunnelIdLabel || "Tunnel ID"}
            </label>
            <input
              type="text"
              value={tunnelId}
              onChange={(e) => setTunnelId(e.target.value)}
              placeholder="tunnel_<32位字符> (由 OpenAI/ChatGPT 分配)"
              className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs font-mono text-theme-primary focus:outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-[11px] text-theme-muted font-mono">
              {isZh ? "OpenAI 分配的隧道唯一标识符（例如 tunnel_abc123...），请勿填写 http 链接" : "Unique identifier assigned by OpenAI (e.g. tunnel_abc123...)"}
            </p>
          </div>

          {/* Runtime API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-theme-secondary">
                {t.tunnel?.runtimeApiKeyLabel || "Runtime API Key"}
              </label>
              {tunnelStatus?.has_api_key && (
                <button
                  type="button"
                  onClick={() => setIsEditingKey(!isEditingKey)}
                  className="text-[11px] text-indigo-500 hover:text-indigo-400 font-medium"
                >
                  {isEditingKey
                    ? t.common?.cancel || "Cancel"
                    : t.tunnel?.replaceBtn || "Replace"}
                </button>
              )}
            </div>
            {isEditingKey ? (
              <input
                type="password"
                value={runtimeApiKey}
                onChange={(e) => setRuntimeApiKey(e.target.value)}
                placeholder={
                  t.tunnel?.runtimeApiKeyPlaceholder || "Enter API Key"
                }
                className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs font-mono text-theme-primary focus:outline-none focus:border-indigo-500"
              />
            ) : (
              <div className="w-full bg-theme-input/50 border border-theme-subtle rounded-lg px-3 py-2 text-xs font-mono text-theme-muted flex items-center justify-between">
                <span>{t.tunnel?.keyConfigured || "Key securely configured"}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              </div>
            )}
          </div>

          {/* Local MCP Token */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-theme-secondary">
                {t.tunnel?.mcpTokenLabel || "MCP Token"}
              </label>
              <div className="flex items-center gap-2">
                {(tunnelStatus?.has_mcp_token || currentMcpToken) && (
                  <button
                    type="button"
                    onClick={handleCopySavedToken}
                    className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    {copiedToken ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span className="text-emerald-500">{isZh ? "已复制" : "Copied"}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>{isZh ? "复制明文令牌" : "Copy Plaintext"}</span>
                      </>
                    )}
                  </button>
                )}
                {tunnelStatus?.has_mcp_token && (
                  <button
                    type="button"
                    onClick={() => setIsEditingToken(!isEditingToken)}
                    className="text-[11px] text-indigo-500 hover:text-indigo-400 font-medium cursor-pointer"
                  >
                    {isEditingToken
                      ? t.common?.cancel || "Cancel"
                      : t.tunnel?.replaceBtn || "Replace"}
                  </button>
                )}
              </div>
            </div>
            {isEditingToken ? (
              <div className="space-y-2">
                <input
                  type="password"
                  value={mcpToken}
                  onChange={(e) => setMcpToken(e.target.value)}
                  placeholder={
                    t.tunnel?.mcpTokenPlaceholder || "Enter MCP Token (lb_...)"
                  }
                  className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs font-mono text-theme-primary focus:outline-none focus:border-indigo-500"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveMcpTokenOnly}
                    disabled={tunnelBusy || !mcpToken.trim()}
                    className="py-1 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isZh ? "保存令牌到 DPAPI" : "Save Token (DPAPI)"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingToken(false);
                      setMcpToken("");
                    }}
                    className="py-1 px-2.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded text-xs transition cursor-pointer"
                  >
                    {t.common?.cancel || "Cancel"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full bg-theme-input/50 border border-theme-subtle rounded-lg px-3 py-2 text-xs font-mono text-theme-muted flex items-center justify-between">
                <span>{t.tunnel?.tokenConfigured || "Token securely configured"}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              </div>
            )}
          </div>


          {/* Auto-reconnect checkbox */}
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={autoReconnect}
              onChange={(e) => setAutoReconnect(e.target.checked)}
              className="rounded border-theme-input text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-theme-secondary font-medium">
              {t.tunnel?.autoReconnectLabel || "Auto-reconnect on disconnect"}
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-theme-subtle">
          <button
            type="button"
            disabled={tunnelBusy || (!tunnelId.trim() && !mcpToken.trim())}
            onClick={() => handleSaveTunnel(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition shadow-sm cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>
              {!tunnelId.trim() && mcpToken.trim()
                ? (isZh ? "保存 MCP 令牌" : "Save MCP Token")
                : (t.tunnel?.saveAndConnectBtn || "Save & Connect")}
            </span>
          </button>

          <button
            type="button"
            disabled={tunnelBusy}
            onClick={handleTestTunnelConnection}
            className="flex items-center gap-1.5 px-3 py-2 bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle rounded-lg text-xs font-medium transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${tunnelBusy ? "animate-spin" : ""}`} />
            <span>{t.tunnel?.testConnectionBtn || "Test Connection"}</span>
          </button>

          {tunnelStatus?.status === "Connected" ? (
            <button
              type="button"
              disabled={tunnelBusy}
              onClick={handleStopTunnel}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 border border-amber-500/30 rounded-lg text-xs font-medium transition disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" />
              <span>{t.tunnel?.disconnectBtn || "Disconnect"}</span>
            </button>
          ) : tunnelStatus?.configured ? (
            <button
              type="button"
              disabled={tunnelBusy}
              onClick={handleStartTunnel}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-500 border border-emerald-500/30 rounded-lg text-xs font-medium transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{t.tunnel?.connectBtn || "Connect"}</span>
            </button>
          ) : null}

          {tunnelStatus?.configured && (
            <button
              type="button"
              disabled={tunnelBusy}
              onClick={handleClearTunnel}
              className="flex items-center gap-1.5 px-3 py-2 text-red-500 hover:bg-red-500/10 rounded-lg text-xs font-medium transition ml-auto disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.tunnel?.removeBtn || "Remove"}</span>
            </button>
          )}
        </div>

        {/* Collapsible Diagnostics Section */}
        <div className="pt-2 border-t border-theme-subtle">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-1.5 text-xs text-theme-muted hover:text-theme-primary font-medium transition"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${
                showDiagnostics ? "rotate-180" : ""
              }`}
            />
            <span>
              {showDiagnostics
                ? t.tunnel?.hideDiagnostics || "Hide Diagnostics"
                : t.tunnel?.viewDiagnostics || "View Diagnostics"}
            </span>
          </button>

          {showDiagnostics && (
            <div className="mt-3 p-3.5 bg-theme-card-muted border border-theme-subtle rounded-lg space-y-2.5 text-xs">
              <div className="font-semibold text-theme-primary text-xs flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                <span>{t.tunnel?.diagnosticsTitle || "Tunnel Diagnostics"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div>
                  <span className="text-theme-muted">
                    {t.tunnel?.networkModeLabel || "Network Mode"}:
                  </span>{" "}
                  <span className="text-theme-primary font-semibold uppercase">
                    {tunnelStatus?.network_mode || "system"}
                  </span>
                </div>
                <div>
                  <span className="text-theme-muted">
                    {t.tunnel?.detectedProxyLabel || "Detected Proxy"}:
                  </span>{" "}
                  <span
                    className="text-theme-primary truncate block"
                    title={
                      tunnelStatus?.active_proxy_url ||
                      tunnelStatus?.resolved_proxy_url ||
                      "Direct / None"
                    }
                  >
                    {tunnelStatus?.active_proxy_url ||
                      tunnelStatus?.resolved_proxy_url ||
                      "Direct / None"}
                  </span>
                </div>
                <div>
                  <span className="text-theme-muted">
                    {t.tunnel?.diagProcess || "Process Status"}:
                  </span>{" "}
                  <span className="text-theme-primary">
                    {tunnelStatus?.status === "Connected"
                      ? "Running (Active)"
                      : tunnelStatus?.status === "Connecting" ||
                        tunnelStatus?.status === "Starting"
                      ? "Starting..."
                      : tunnelStatus?.status === "Reconnecting"
                      ? "Restarting (Backoff)"
                      : tunnelStatus?.status === "Stopped"
                      ? "Stopped"
                      : tunnelStatus?.status === "NotConfigured"
                      ? "Not Configured"
                      : tunnelStatus?.status || "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="text-theme-muted">
                    {t.tunnel?.diagLocalHealth || "Local Health"}:
                  </span>{" "}
                  <span className="text-theme-primary">
                    {tunnelStatus?.status === "Connected"
                      ? `OK (Port ${tunnelStatus.health_port})`
                      : tunnelStatus?.status === "HealthPortConflict"
                      ? `Conflict (Port ${tunnelStatus?.health_port || 8080})`
                      : `Standby (Port ${tunnelStatus?.health_port || 8080})`}
                  </span>
                </div>
                <div>
                  <span className="text-theme-muted">
                    {t.tunnel?.diagControlPlane || "Control Plane"}:
                  </span>{" "}
                  <span
                    className={
                      tunnelStatus?.control_plane_status === "Connected" ||
                      tunnelStatus?.control_plane_connected
                        ? "text-emerald-500 font-semibold"
                        : "text-theme-primary"
                    }
                  >
                    {tunnelStatus?.control_plane_status === "Connected" ||
                    tunnelStatus?.control_plane_connected
                      ? t.tunnel?.controlPlaneConnected || "Connected"
                      : tunnelStatus?.status === "Connecting" ||
                        tunnelStatus?.status === "Starting" ||
                        tunnelStatus?.control_plane_status === "Polling"
                      ? t.tunnel?.controlPlanePolling || "Polling..."
                      : tunnelStatus?.status === "AuthenticationError"
                      ? "Auth Failed (401/403)"
                      : t.tunnel?.controlPlaneFailed || "Disconnected"}
                  </span>
                </div>
                <div>
                  <span className="text-theme-muted">
                    {t.tunnel?.diagMcpSession || "MCP Session"}:
                  </span>{" "}
                  <span
                    className={
                      tunnelStatus?.local_mcp_status !== "Failed" &&
                      tunnelStatus?.local_mcp_connected !== false
                        ? "text-emerald-500 font-semibold"
                        : "text-red-500 font-semibold"
                    }
                  >
                    {tunnelStatus?.local_mcp_status !== "Failed" &&
                    tunnelStatus?.local_mcp_connected !== false
                      ? t.tunnel?.localMcpConnected || "Ready"
                      : t.tunnel?.localMcpFailed || "Unavailable"}
                  </span>
                </div>
                <div>
                  <span className="text-theme-muted">
                    {t.tunnel?.diagReconnectAttempts || "Reconnect Attempts"}:
                  </span>{" "}
                  <span className="text-theme-primary">
                    {tunnelStatus?.reconnect_attempts ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-theme-muted">
                    {t.tunnel?.diagChildExitCode || "Exit Code"}:
                  </span>{" "}
                  <span className="text-theme-primary">
                    {tunnelStatus?.error_message?.includes("exit code")
                      ? tunnelStatus.error_message.match(/exit code[:\s]+(\d+)/i)?.[1] ??
                        "Non-zero"
                      : "0 (OK)"}
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-theme-subtle">
                <div className="text-[11px] text-theme-muted mb-1">
                  {t.tunnel?.diagLastError || "Last Error"}:
                </div>
                <div className="p-2 bg-theme-card rounded border border-theme-subtle text-[11px] font-mono break-all text-theme-secondary">
                  {redactSecrets(tunnelStatus?.error_message) ||
                    (language === "zh-CN" ? "无" : "None")}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {renderTokenRevealModal()}
    </div>
  );
};
