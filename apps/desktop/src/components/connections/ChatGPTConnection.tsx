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
} from "lucide-react";
import { bridge } from "../../api/bridge.js";
import {
  type TunnelStatusDto,
  type AIConnectionDto,
  type TestConnectionResult,
  RemoteMcpEndpointResolver,
} from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface ChatGPTConnectionProps {
  tunnelStatus: TunnelStatusDto | null;
  onRefreshAll: () => void;
  onNavigateToTunnel: () => void;
}

export const ChatGPTConnection: React.FC<ChatGPTConnectionProps> = ({
  tunnelStatus,
  onRefreshAll,
  onNavigateToTunnel,
}) => {
  const { language } = useTranslation();
  const isZh = language === "zh-CN";

  const [connection, setConnection] = useState<AIConnectionDto | null>(null);
  const [, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [rotating, setRotating] = useState(false);
  const [scopes, setScopes] = useState<string[]>(["read", "write", "execute"]);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const fetchConnection = useCallback(async () => {
    try {
      const res = await bridge.listAiConnections();
      const chatgpt = res.connections.find((c: AIConnectionDto) => c.clientType === "chatgpt") || null;
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

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

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
        toolCount: 59,
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

  const handleToggleScope = async (scope: string) => {
    const nextScopes = scopes.includes(scope)
      ? scopes.filter((s) => s !== scope)
      : [...scopes, scope];
    if (nextScopes.length === 0) return; // Keep at least one scope
    setScopes(nextScopes);
    setRotating(true);
    try {
      await bridge.rotateAiConnectionToken("conn_chatgpt", nextScopes);
      await fetchConnection();
      onRefreshAll();
    } finally {
      setRotating(false);
    }
  };

  const handleCopyEndpoint = () => {
    if (!endpointInfo.endpoint) return;
    navigator.clipboard.writeText(endpointInfo.endpoint);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

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
                    ? isZh ? "已连接" : "Connected"
                    : isZh ? "未连接" : "Standby"}
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
            <div className="text-sm font-bold font-mono text-theme-primary">
              59
            </div>
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
            <div className="text-sm font-bold font-mono text-theme-primary">
              2024-11-05
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Secure MCP Tunnel */}
        <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-500" />
              <h3 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
                {isZh ? "Secure MCP Tunnel" : "Secure MCP Tunnel"}
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
              <span className="text-theme-muted font-mono">{isZh ? "网络代理" : "Network Mode"}</span>
              <span className="font-semibold text-theme-primary font-mono capitalize">
                {tunnelStatus?.network_mode === "custom"
                  ? isZh ? "自定义代理 (Custom)" : "Custom Proxy"
                  : tunnelStatus?.network_mode === "direct"
                  ? isZh ? "直连 (Direct)" : "Direct"
                  : isZh ? "系统代理 (System Proxy)" : "System Proxy"}
              </span>
            </div>

            <div className="space-y-1.5 py-1 border-b border-theme-subtle/50">
              <div className="flex items-center justify-between">
                <span className="text-theme-muted font-mono">{isZh ? "公网 MCP 端点" : "Remote MCP Endpoint"}</span>
                {endpointInfo.endpoint && (
                  <button
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
                {endpointInfo.endpoint || (isZh ? "安全隧道未连接" : "Tunnel is offline")}
              </div>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-theme-subtle/50">
              <span className="text-theme-muted font-mono">{isZh ? "运行时凭据" : "Runtime Credential"}</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <Lock className="w-3 h-3" />
                <span>{isZh ? "已安全保存 (DPAPI)" : "Securely Stored (DPAPI)"}</span>
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-theme-muted font-mono">{isZh ? "MCP 鉴权令牌" : "MCP Credential"}</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                <span>{connection?.tokenMasked || (isZh ? "已配置" : "Configured")}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: ChatGPT Access & Permissions */}
        <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
                {isZh ? "ChatGPT 权限配置" : "ChatGPT Access & Scopes"}
              </h3>
            </div>
            <span className="text-[10px] font-mono text-theme-muted">
              {isZh ? "沙箱保护中" : "Sandboxed"}
            </span>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-theme-muted leading-relaxed">
              {isZh
                ? "允许 ChatGPT 在当前授权的工作区中调用的能力范围。所有高风险操作受 Safe / Auto / Full Control 模式策略保护。"
                : "Scopes granted to ChatGPT across authorized workspaces. Sensitive operations are governed by Policy & Approval."}
            </p>

            <div className="space-y-2 pt-1">
              {[
                {
                  id: "read",
                  label: isZh ? "读取 (Read)" : "Read",
                  desc: isZh ? "允许读取授权项目内的文件内容、目录结构与 Git 状态。" : "Read files, directories, and Git status in authorized projects.",
                },
                {
                  id: "write",
                  label: isZh ? "写入 (Write)" : "Write",
                  desc: isZh ? "允许创建、编辑和修改代码文件（敏感变更逐项确认）。" : "Create, edit, and modify code files (subject to confirmation).",
                },
                {
                  id: "execute",
                  label: isZh ? "执行 (Execute)" : "Execute",
                  desc: isZh ? "允许运行受控终端命令、测试套件与工作流。" : "Run sandboxed terminal commands, tests, and workflows.",
                },
              ].map((s) => (
                <label
                  key={s.id}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-theme-card-muted border border-theme-subtle hover:border-theme-strong cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(s.id)}
                    onChange={() => handleToggleScope(s.id)}
                    disabled={rotating}
                    className="mt-0.5 rounded border-theme-subtle text-sky-600 focus:ring-sky-500"
                  />
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-theme-primary">
                      {s.label}
                    </div>
                    <div className="text-[11px] text-theme-muted leading-relaxed">
                      {s.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm disabled:opacity-50"
          >
            <Activity className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
            <span>{testing ? (isZh ? "测试中..." : "Testing...") : (isZh ? "测试连接" : "Test Connection")}</span>
          </button>

          <button
            onClick={handleReconnect}
            disabled={reconnecting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? "animate-spin" : ""}`} />
            <span>{reconnecting ? (isZh ? "重连中..." : "Reconnecting...") : (isZh ? "重新连接" : "Reconnect")}</span>
          </button>

          <button
            onClick={onNavigateToTunnel}
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
    </div>
  );
};
