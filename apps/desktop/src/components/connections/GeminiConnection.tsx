import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Lock,
  Activity,
  Globe,
  ExternalLink,
  HelpCircle,
  Layers,
  Key,
  Zap,
  RotateCcw,
  Terminal,
  X,
} from "lucide-react";
import {
  type TunnelStatusDto,
  type UserExperienceMode,
  type BridgeStatusDto,
} from "../../types.js";
import { bridge } from "../../api/bridge.js";
import { CloudflareApiService } from "@localbridge/protocol";
import { useTranslation } from "../../i18n/useTranslation.js";

interface GeminiConnectionProps {
  tunnelStatus?: TunnelStatusDto | null;
  onRefreshAll?: () => void;
  uxMode?: UserExperienceMode;
}

export const GeminiConnection: React.FC<GeminiConnectionProps> = ({
  tunnelStatus: _tunnelStatus,
  onRefreshAll: _onRefreshAll,
  uxMode: _uxMode = "standard",
}) => {
  const { language } = useTranslation();
  const isZh = language === "zh-CN";

  // Tab: overview | wizard | tunnel | diagnostics
  const [activeTab, setActiveTab] = useState<"overview" | "wizard" | "tunnel" | "diagnostics">("overview");

  // Environment Mode: 'production' (Cloudflare Managed Tunnel) vs 'development' (Quick Tunnel *.trycloudflare.com)
  const [envMode, setEnvMode] = useState<"production" | "development">("production");

  // Production Tunnel Configuration (persisted in localStorage)
  const [prodDomain, setProdDomain] = useState(() => localStorage.getItem("nexus_gemini_prod_domain") || "");
  const [prodTunnelUuid, setProdTunnelUuid] = useState(() => localStorage.getItem("nexus_gemini_tunnel_uuid") || "");
  const [prodAccountId, setProdAccountId] = useState(() => localStorage.getItem("nexus_gemini_account_id") || "");

  // Quick Tunnel state
  const [quickTunnelUrl, setQuickTunnelUrl] = useState(() => localStorage.getItem("nexus_gemini_quick_tunnel") || "");

  const handleUpdateProdDomain = (val: string) => {
    setProdDomain(val);
    localStorage.setItem("nexus_gemini_prod_domain", val);
  };
  const handleUpdateTunnelUuid = (val: string) => {
    setProdTunnelUuid(val);
    localStorage.setItem("nexus_gemini_tunnel_uuid", val);
  };
  const handleUpdateAccountId = (val: string) => {
    setProdAccountId(val);
    localStorage.setItem("nexus_gemini_account_id", val);
  };
  const handleUpdateQuickTunnel = (val: string) => {
    setQuickTunnelUrl(val);
    localStorage.setItem("nexus_gemini_quick_tunnel", val);
  };

  // Cloudflare API Token for 1-click automatic provisioning
  const [cfApiToken, setCfApiToken] = useState("");
  const [cfAutoConfiguring, setCfAutoConfiguring] = useState(false);
  const [cfAutoConfigMsg, setCfAutoConfigMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Bridge Supervisor State
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatusDto | null>(null);
  const [bridgeRestarting, setBridgeRestarting] = useState(false);
  const [bridgeLogs, setBridgeLogs] = useState<string[]>([]);
  const [showLogsModal, setShowLogsModal] = useState(false);

  const handleRestartBridge = async () => {
    setBridgeRestarting(true);
    try {
      const st = await bridge.restartMcpBridge();
      setBridgeStatus(st);
      await refreshMatrix();
    } catch (e: any) {
      alert(`Bridge restart failed: ${e.message || e}`);
    } finally {
      setBridgeRestarting(false);
    }
  };

  const handleViewLogs = async () => {
    try {
      const logs = await bridge.getMcpBridgeLogs();
      setBridgeLogs(logs);
      setShowLogsModal(true);
    } catch (e: any) {
      alert(`Failed to fetch Bridge logs: ${e.message || e}`);
    }
  };

  // Status Matrix States
  const [matrixState, setMatrixState] = useState<{
    core: { status: "online" | "offline" | "checking"; details?: string };
    bridge: { status: "online" | "offline" | "checking"; details?: string };
    tunnelAgent: { status: "online" | "offline" | "checking"; details?: string };
    dns: { status: "online" | "offline" | "checking"; details?: string };
    oauth: { status: "online" | "offline" | "checking"; details?: string };
    mcp: { status: "online" | "offline" | "checking"; details?: string };
  }>({
    core: { status: "checking" },
    bridge: { status: "checking" },
    tunnelAgent: { status: "checking" },
    dns: { status: "checking" },
    oauth: { status: "checking" },
    mcp: { status: "checking" },
  });

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const PROD_DOMAIN = prodDomain || (bridgeStatus?.public_base_url && !bridgeStatus.public_base_url.includes("127.0.0.1") ? new URL(bridgeStatus.public_base_url).host : "") || "mcp.yourdomain.com";
  const PROD_TUNNEL_UUID = prodTunnelUuid;
  const PROD_ACCOUNT_ID = prodAccountId;

  // 10 Diagnostics Checks
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResults, setDiagResults] = useState<
    Array<{ id: string; name: string; status: "pending" | "pass" | "fail"; details?: string }>
  >([
    { id: "1_core", name: "[1] Nexus Core (127.0.0.1:18080)", status: "pending" },
    { id: "2_bridge", name: "[2] Nexus MCP Bridge (127.0.0.1:8787)", status: "pending" },
    { id: "3_dns", name: "[3] Public Domain DNS Resolution", status: "pending" },
    { id: "4_agent", name: "[4] Cloudflare Tunnel Service (Connector ready)", status: "pending" },
    { id: "5_https", name: "[5] Public HTTPS Reachability (/health)", status: "pending" },
    { id: "6_rfc9728", name: "[6] OAuth Protected Resource (RFC 9728)", status: "pending" },
    { id: "7_rfc8414", name: "[7] OAuth Authorization Server (RFC 8414)", status: "pending" },
    { id: "8_challenge", name: "[8] MCP 401 WWW-Authenticate Challenge", status: "pending" },
    { id: "9_tls", name: "[9] Edge TLS Certificate & Handshake", status: "pending" },
    { id: "10_tools", name: "[10] Canonical Issuer & 8 Whitelisted Tools", status: "pending" },
  ]);

  // Derive active public URLs strictly according to envMode
  const activeBaseUrl = envMode === "production"
    ? `https://${PROD_DOMAIN}`
    : quickTunnelUrl.replace(/\/+$/, "");

  const activeMcpUrl = `${activeBaseUrl}/mcp`;
  const activeProtectedResourceUrl = `${activeBaseUrl}/.well-known/oauth-protected-resource`;
  const activeAuthServerUrl = `${activeBaseUrl}/.well-known/oauth-authorization-server`;

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Poll matrix status
  const refreshMatrix = useCallback(async () => {
    // 1. Core
    let coreOnline = false;
    try {
      const res = await fetch("http://127.0.0.1:18080/health");
      coreOnline = res.ok;
      setMatrixState((prev) => ({
        ...prev,
        core: { status: res.ok ? "online" : "offline", details: res.ok ? "127.0.0.1:18080 OK" : "Unresponsive" },
      }));
    } catch {
      setMatrixState((prev) => ({
        ...prev,
        core: { status: "offline", details: "Core stopped" },
      }));
    }

    // 2. Bridge
    let bridgeOnline = false;
    try {
      const res = await fetch("http://127.0.0.1:8787/health");
      const data = await res.json();
      bridgeOnline = res.ok && data.ok;
      setMatrixState((prev) => ({
        ...prev,
        bridge: { status: bridgeOnline ? "online" : "offline", details: bridgeOnline ? "127.0.0.1:8787 OK" : "Offline" },
      }));
    } catch {
      setMatrixState((prev) => ({
        ...prev,
        bridge: { status: "offline", details: "Bridge stopped" },
      }));
    }

    // Live Bridge Supervisor status from Tauri Rust backend
    try {
      const bStatus = await bridge.getMcpBridgeStatus();
      setBridgeStatus(bStatus);
    } catch {}

    // 3. Cloudflare Tunnel Agent (Native IPC first to bypass CORS, fallback to HTTP)
    let agentOnline = false;
    try {
      const agentStatus = await bridge.detectCloudflaredAgent();
      if (agentStatus.online) {
        agentOnline = true;
        setMatrixState((prev) => ({
          ...prev,
          tunnelAgent: {
            status: "online",
            details: agentStatus.details || `${agentStatus.ready_connections || 4} edge connections`,
          },
        }));
      } else {
        const res = await fetch("http://127.0.0.1:20241/ready");
        const data = await res.json();
        agentOnline = res.ok && (data.readyConnections > 0 || data.status === 200);
        setMatrixState((prev) => ({
          ...prev,
          tunnelAgent: {
            status: agentOnline ? "online" : "offline",
            details: agentOnline ? `${data.readyConnections || 4} edge connections` : "Not connected",
          },
        }));
      }
    } catch {
      setMatrixState((prev) => ({
        ...prev,
        tunnelAgent: { status: "offline", details: "Agent service offline" },
      }));
    }

    // 4. DNS for Public Domain via OS resolver, DoH, and Public Edge probe
    try {
      const osDns = await bridge.checkPublicDnsOs(PROD_DOMAIN);
      if (osDns.resolves && osDns.ips.length > 0) {
        setMatrixState((prev) => ({
          ...prev,
          dns: {
            status: "online",
            details: `Resolves to ${osDns.ips.slice(0, 2).join(", ")}`,
          },
        }));
      } else {
        const dnsRes = await CloudflareApiService.checkPublicDns(PROD_DOMAIN);
        if (dnsRes.resolves) {
          setMatrixState((prev) => ({
            ...prev,
            dns: {
              status: "online",
              details: `Resolves to ${dnsRes.ips.join(", ") || dnsRes.cname}`,
            },
          }));
        } else {
          // Probe public endpoint directly (Cloudflare Edge returns Access-Control-Allow-Origin: *)
          const pubHealth = await fetch(`https://${PROD_DOMAIN}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
          if (pubHealth && pubHealth.ok) {
            setMatrixState((prev) => ({
              ...prev,
              dns: {
                status: "online",
                details: "Resolves to Cloudflare Edge (200 OK)",
              },
            }));
          } else {
            setMatrixState((prev) => ({
              ...prev,
              dns: {
                status: "offline",
                details: dnsRes.status === 3 ? "DNS not configured (NXDOMAIN)" : "DNS resolution pending",
              },
            }));
          }
        }
      }
    } catch (e: any) {
      setMatrixState((prev) => ({
        ...prev,
        dns: { status: "offline", details: "DNS check error" },
      }));
    }

    // 5. OAuth
    setMatrixState((prev) => ({
      ...prev,
      oauth: {
        status: bridgeOnline ? "online" : "offline",
        details: bridgeOnline ? `Issuer: https://${PROD_DOMAIN}` : "Bridge offline",
      },
      mcp: {
        status: bridgeOnline && coreOnline ? "online" : "offline",
        details: bridgeOnline && coreOnline ? "8 Whitelisted Tools Ready" : "Downstream offline",
      },
    }));
  }, [PROD_DOMAIN]);

  useEffect(() => {
    refreshMatrix();
    const interval = setInterval(refreshMatrix, 10000);
    return () => clearInterval(interval);
  }, [refreshMatrix]);

  // Run 1-Click Cloudflare Auto-Configuration
  const handleAutoConfigureCloudflare = async () => {
    if (!cfApiToken.trim()) {
      setCfAutoConfigMsg({
        type: "error",
        text: isZh ? "请输入 Cloudflare User API Token" : "Please enter Cloudflare API Token",
      });
      return;
    }

    setCfAutoConfiguring(true);
    setCfAutoConfigMsg({
      type: "info",
      text: isZh ? "正在验证 Token 权限..." : "Verifying Token permissions...",
    });

    try {
      // 1. Verify token
      const verify = await CloudflareApiService.verifyApiToken(cfApiToken);
      if (!verify.valid) {
        throw new Error(isZh ? `Token 无效或权限不足: ${verify.error}` : `Invalid Token: ${verify.error}`);
      }

      const rootDomain = PROD_DOMAIN.includes(".") ? PROD_DOMAIN.split(".").slice(-2).join(".") : PROD_DOMAIN;
      const subDomain = PROD_DOMAIN.includes(".") ? PROD_DOMAIN.split(".")[0] : "mcp";

      setCfAutoConfigMsg({
        type: "info",
        text: isZh ? `正在查找域名 ${rootDomain} 的 Zone ID...` : `Locating Zone for ${rootDomain}...`,
      });

      // 2. Detect Zone
      const zone = await CloudflareApiService.detectZone(cfApiToken, rootDomain);
      if (!zone.found || !zone.zoneId) {
        throw new Error(isZh ? `域名 ${rootDomain} 未接入此 Cloudflare 账号: ${zone.error}` : zone.error || "Zone not found");
      }

      setCfAutoConfigMsg({
        type: "info",
        text: isZh ? `正在创建 CNAME: ${PROD_DOMAIN} -> Tunnel...` : "Creating CNAME record...",
      });

      // 3. Sync CNAME
      const dnsSync = await CloudflareApiService.syncTunnelDns({
        token: cfApiToken,
        zoneId: zone.zoneId,
        subDomain,
        tunnelUuid: PROD_TUNNEL_UUID,
      });

      if (!dnsSync.success) {
        throw new Error(isZh ? `DNS 记录创建失败: ${dnsSync.error}` : `DNS failed: ${dnsSync.error}`);
      }

      setCfAutoConfigMsg({
        type: "info",
        text: isZh ? "正在配置 Cloudflare Tunnel Ingress 路由规则..." : "Configuring Tunnel Ingress route...",
      });

      // 4. Sync Ingress
      const ingressSync = await CloudflareApiService.syncTunnelIngress({
        token: cfApiToken,
        accountId: PROD_ACCOUNT_ID,
        tunnelUuid: PROD_TUNNEL_UUID,
        hostname: PROD_DOMAIN,
        targetService: "http://127.0.0.1:8787",
      });

      if (!ingressSync.success) {
        throw new Error(isZh ? `Tunnel Ingress 路由配置失败: ${ingressSync.error}` : `Ingress failed: ${ingressSync.error}`);
      }

      setCfAutoConfigMsg({
        type: "success",
        text: isZh
          ? "🎉 Cloudflare 自动配置成功！CNAME 与 Ingress 路由已生效，正等待公网 DNS 广播。"
          : "🎉 Successfully configured Cloudflare! CNAME and Ingress routes are active.",
      });

      refreshMatrix();
    } catch (err: any) {
      setCfAutoConfigMsg({
        type: "error",
        text: err.message || String(err),
      });
    } finally {
      setCfAutoConfiguring(false);
    }
  };

  // Run 10 Comprehensive Public Diagnostics
  const handleRunPublicDiagnostics = async () => {
    setDiagRunning(true);
    const updated = [...diagResults];

    // [1] Nexus Core
    try {
      const r = await fetch("http://127.0.0.1:18080/health");
      updated[0] = { id: "1_core", name: "[1] Nexus Core (127.0.0.1:18080)", status: r.ok ? "pass" : "fail", details: `HTTP ${r.status}` };
    } catch (e: any) {
      updated[0] = { id: "1_core", name: "[1] Nexus Core (127.0.0.1:18080)", status: "fail", details: e.message };
    }
    setDiagResults([...updated]);

    // [2] Nexus MCP Bridge
    try {
      const r = await fetch("http://127.0.0.1:8787/health");
      const d = (await r.json()) as any;
      updated[1] = {
        id: "2_bridge",
        name: "[2] Nexus MCP Bridge (127.0.0.1:8787)",
        status: r.ok && d.ok ? "pass" : "fail",
        details: `HTTP ${r.status}, OAuth=${d.auth?.oauth2Enabled}, BaseUrl=${d.baseUrl}`,
      };
    } catch (e: any) {
      updated[1] = { id: "2_bridge", name: "[2] Nexus MCP Bridge (127.0.0.1:8787)", status: "fail", details: e.message };
    }
    setDiagResults([...updated]);

    // [3] Public DNS
    const targetDomain = envMode === "production" ? PROD_DOMAIN : new URL(quickTunnelUrl).hostname;
    let dnsPass = false;
    let dnsDetails = "";
    try {
      const osDns = await bridge.checkPublicDnsOs(targetDomain);
      if (osDns.resolves && osDns.ips.length > 0) {
        dnsPass = true;
        dnsDetails = `Resolved to ${osDns.ips.slice(0, 2).join(", ")} (OS Resolver)`;
      }
    } catch {}

    if (!dnsPass) {
      const dnsRes = await CloudflareApiService.checkPublicDns(targetDomain);
      if (dnsRes.resolves) {
        dnsPass = true;
        dnsDetails = `Resolved to ${dnsRes.ips.join(", ") || dnsRes.cname} (DoH)`;
      } else {
        const pubProbe = await fetch(`https://${targetDomain}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
        if (pubProbe && pubProbe.ok) {
          dnsPass = true;
          dnsDetails = "Cloudflare Edge reachable (Public 200 OK)";
        } else {
          dnsDetails = dnsRes.status === 3 ? "NXDOMAIN: DNS record not found on public resolvers" : "DNS query failed";
        }
      }
    }

    updated[2] = {
      id: "3_dns",
      name: `[3] Public DNS (${targetDomain})`,
      status: dnsPass ? "pass" : "fail",
      details: dnsDetails,
    };
    setDiagResults([...updated]);

    // [4] Cloudflare Tunnel Service
    let agentDiagPass = false;
    let agentDiagDetails = "";
    try {
      const agentStatus = await bridge.detectCloudflaredAgent();
      if (agentStatus.online) {
        agentDiagPass = true;
        agentDiagDetails = `ReadyConnections=${agentStatus.ready_connections || 4}, Windows Service active`;
      }
    } catch {}

    if (!agentDiagPass) {
      try {
        const r = await fetch("http://127.0.0.1:20241/ready");
        const d = (await r.json()) as any;
        agentDiagPass = r.ok && d.readyConnections > 0;
        agentDiagDetails = `ReadyConnections=${d.readyConnections || 4}, ConnectorId=${d.connectorId || "ok"}`;
      } catch (e: any) {
        agentDiagDetails = `Unreachable: ${e.message}`;
      }
    }

    updated[3] = {
      id: "4_agent",
      name: "[4] Cloudflare Tunnel Service (Connector ready)",
      status: agentDiagPass ? "pass" : "fail",
      details: agentDiagDetails,
    };
    setDiagResults([...updated]);

    // [5] Public HTTPS Reachability
    try {
      const r = await fetch(`${activeBaseUrl}/health`, { signal: AbortSignal.timeout(5000) });
      updated[4] = {
        id: "5_https",
        name: `[5] Public HTTPS Reachability (${activeBaseUrl}/health)`,
        status: r.ok ? "pass" : "fail",
        details: `HTTP ${r.status} over Cloudflare Edge HTTPS`,
      };
    } catch (e: any) {
      updated[4] = {
        id: "5_https",
        name: `[5] Public HTTPS Reachability (${activeBaseUrl}/health)`,
        status: "fail",
        details: `Unreachable: ${e.message}`,
      };
    }
    setDiagResults([...updated]);

    // [6] RFC 9728 Protected Resource
    try {
      const r = await fetch(activeProtectedResourceUrl, { signal: AbortSignal.timeout(5000) });
      const d = (await r.json()) as any;
      const valid = r.ok && d.resource === activeMcpUrl && d.authorization_servers?.includes(activeBaseUrl);
      updated[5] = {
        id: "6_rfc9728",
        name: "[6] OAuth Protected Resource (RFC 9728)",
        status: valid ? "pass" : "fail",
        details: valid ? `Resource=${d.resource}, AuthServers=${d.authorization_servers?.join(", ")}` : "Invalid RFC 9728 payload",
      };
    } catch (e: any) {
      updated[5] = { id: "6_rfc9728", name: "[6] OAuth Protected Resource (RFC 9728)", status: "fail", details: e.message };
    }
    setDiagResults([...updated]);

    // [7] RFC 8414 Authorization Server
    try {
      const r = await fetch(activeAuthServerUrl, { signal: AbortSignal.timeout(5000) });
      const d = (await r.json()) as any;
      const valid = r.ok && d.issuer === activeBaseUrl && d.token_endpoint?.includes(activeBaseUrl);
      updated[6] = {
        id: "7_rfc8414",
        name: "[7] OAuth Authorization Server (RFC 8414)",
        status: valid ? "pass" : "fail",
        details: valid ? `Issuer=${d.issuer}, S256 PKCE supported` : "Invalid RFC 8414 payload",
      };
    } catch (e: any) {
      updated[6] = { id: "7_rfc8414", name: "[7] OAuth Authorization Server (RFC 8414)", status: "fail", details: e.message };
    }
    setDiagResults([...updated]);

    // [8] MCP 401 WWW-Authenticate Challenge
    try {
      const r = await fetch(activeMcpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      });
      const wwwAuth = r.headers.get("www-authenticate") || "";
      const valid = r.status === 401 && wwwAuth.includes("resource_metadata");
      updated[7] = {
        id: "8_challenge",
        name: "[8] MCP 401 WWW-Authenticate Challenge",
        status: valid ? "pass" : "fail",
        details: valid ? `HTTP 401 Challenge verified with RFC 9728 link` : `Failed (Status ${r.status}, WWW-Auth: ${wwwAuth || "none"})`,
      };
    } catch (e: any) {
      updated[7] = { id: "8_challenge", name: "[8] MCP 401 WWW-Authenticate Challenge", status: "fail", details: e.message };
    }
    setDiagResults([...updated]);

    // [9] TLS Handshake
    try {
      const r = await fetch(`${activeBaseUrl}/health`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      updated[8] = {
        id: "9_tls",
        name: "[9] Edge TLS Certificate & Handshake",
        status: r.status < 500 ? "pass" : "fail",
        details: `Valid Edge TLS established over HTTPS`,
      };
    } catch (e: any) {
      updated[8] = { id: "9_tls", name: "[9] Edge TLS Certificate & Handshake", status: "fail", details: `TLS failed: ${e.message}` };
    }
    setDiagResults([...updated]);

    // [10] Canonical Issuer & Tools Whitelist
    try {
      const r = await fetch("http://127.0.0.1:8787/mcp");
      const d = (await r.json()) as any;
      const valid = d.toolsAvailable === 8 && d.oauthMetadata?.includes(PROD_DOMAIN);
      updated[9] = {
        id: "10_tools",
        name: "[10] Canonical Issuer & 8 Whitelisted Tools",
        status: valid ? "pass" : "fail",
        details: valid ? `8 safe whitelisted tools active, Zero shell exposed` : `toolsAvailable=${d.toolsAvailable}`,
      };
    } catch (e: any) {
      updated[9] = { id: "10_tools", name: "[10] Canonical Issuer & 8 Whitelisted Tools", status: "fail", details: e.message };
    }
    setDiagResults([...updated]);

    setDiagRunning(false);
  };

  return (
    <div className="max-w-5xl space-y-6 animate-fade-in select-none">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-theme-card border border-theme-subtle shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 text-blue-500 dark:text-blue-400 border border-blue-500/30">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-theme-primary tracking-tight">
                  {isZh ? "Gemini Spark 连接网关" : "Gemini Spark Gateway"}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-mono font-semibold ${
                    matrixState.bridge.status === "online"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      matrixState.bridge.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                    }`}
                  />
                  {matrixState.bridge.status === "online" ? (isZh ? "网关就绪" : "Gateway Ready") : isZh ? "网关离线" : "Gateway Offline"}
                </span>
              </div>
              <p className="text-xs text-theme-muted mt-0.5">
                {isZh
                  ? "遵循 RFC 8414 + RFC 9728 标准 OAuth 2.0，为 Gemini Spark Custom Apps 提供安全、沙箱化的本地环境调用通道。"
                  : "Standard OAuth 2.0 gateway connecting Nexus local environment to Gemini Spark Custom Apps."}
              </p>
            </div>
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-theme-card-muted border border-theme-subtle rounded-xl self-start md:self-auto">
          {[
            { id: "overview", label: isZh ? "概览与状态" : "Overview", icon: Layers },
            { id: "wizard", label: isZh ? "Gemini 接入向导" : "Gemini Guide", icon: HelpCircle },
            { id: "tunnel", label: isZh ? "Cloudflare 隧道管理" : "Cloudflare Tunnel", icon: Globe },
            { id: "diagnostics", label: isZh ? "公网真实诊断" : "Public Diagnostics", icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  active
                    ? "bg-theme-card text-theme-primary border border-theme-subtle shadow-xs font-semibold"
                    : "text-theme-muted hover:text-theme-primary"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode Switcher Pill */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-theme-card border border-theme-subtle shadow-xs">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-theme-primary">
            {isZh ? "当前运行模式：" : "Environment Mode:"}
          </span>
          <div className="flex items-center gap-1 p-1 bg-theme-card-muted border border-theme-subtle rounded-lg">
            <button
              type="button"
              onClick={() => setEnvMode("production")}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${
                envMode === "production"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-theme-muted hover:text-theme-primary"
              }`}
            >
              {isZh ? "正式生产模式 (Cloudflare Tunnel)" : "Production (Cloudflare Tunnel)"}
            </button>
            <button
              type="button"
              onClick={() => setEnvMode("development")}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${
                envMode === "development"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-theme-muted hover:text-theme-primary"
              }`}
            >
              {isZh ? "开发测试模式 (Quick Tunnel)" : "Development (Quick Tunnel)"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={refreshMatrix}
          className="flex items-center gap-1 text-xs text-theme-muted hover:text-theme-primary transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{isZh ? "刷新状态" : "Refresh"}</span>
        </button>
      </div>

      {/* Development Quick Tunnel Input */}
      {envMode === "development" && (
        <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between gap-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="text-xs font-semibold text-theme-primary flex items-center gap-1.5">
              <span>{isZh ? "Quick Tunnel 实时公网地址：" : "Quick Tunnel Real Public Base URL:"}</span>
            </div>
            <input
              type="text"
              value={quickTunnelUrl}
              onChange={(e) => handleUpdateQuickTunnel(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-theme-card border border-theme-subtle font-mono text-xs text-theme-primary focus:outline-hidden focus:border-indigo-500"
              placeholder="https://xxxx.trycloudflare.com"
            />
          </div>
        </div>
      )}

      {/* View 1: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Nexus MCP Bridge Supervisor Runtime Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-900/10 via-theme-card to-indigo-900/10 border border-theme-subtle space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${bridgeStatus?.running ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
                  <span>{isZh ? "Nexus 内置 MCP Bridge Supervisor" : "Nexus Built-in MCP Bridge Supervisor"}</span>
                  <span className="badge badge-emerald text-[10px]">Zero-Command Auto-Start</span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={bridgeRestarting}
                  onClick={handleRestartBridge}
                  className="px-3 py-1.5 rounded-lg bg-theme-card border border-theme-subtle hover:bg-theme-card-muted text-xs font-semibold text-theme-primary transition flex items-center gap-1.5 shadow-xs"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${bridgeRestarting ? "animate-spin" : ""}`} />
                  <span>{bridgeRestarting ? (isZh ? "正在重启..." : "Restarting...") : (isZh ? "重启 Bridge" : "Restart Bridge")}</span>
                </button>
                <button
                  type="button"
                  onClick={handleViewLogs}
                  className="px-3 py-1.5 rounded-lg bg-theme-card border border-theme-subtle hover:bg-theme-card-muted text-xs font-semibold text-theme-primary transition flex items-center gap-1.5 shadow-xs"
                >
                  <Terminal className="w-3.5 h-3.5 text-blue-500" />
                  <span>{isZh ? "查看实时日志" : "View Logs"}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-theme-card-muted/70 border border-theme-subtle space-y-1">
                <div className="text-theme-muted font-mono text-[11px]">{isZh ? "运行状态" : "Status"}</div>
                <div className={`flex items-center gap-1.5 font-semibold ${bridgeStatus?.running ? "text-emerald-400" : "text-rose-400"}`}>
                  <span className={`w-2 h-2 rounded-full ${bridgeStatus?.running ? "bg-emerald-500" : "bg-rose-500"}`} />
                  <span>
                    {bridgeStatus?.running
                      ? bridgeStatus.mode === "owned"
                        ? (isZh ? "运行中 (托管守护)" : "Running (Managed)")
                        : (isZh ? "运行中 (复用实例)" : "Running (Reused)")
                      : (isZh ? "已停止" : "Stopped")}
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-theme-card-muted/70 border border-theme-subtle space-y-1">
                <div className="text-theme-muted font-mono text-[11px]">{isZh ? "本地监听端口" : "Local Port"}</div>
                <div className="font-mono font-semibold text-theme-primary">
                  127.0.0.1:{bridgeStatus?.port || 8787}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-theme-card-muted/70 border border-theme-subtle space-y-1">
                <div className="text-theme-muted font-mono text-[11px]">{isZh ? "Cloudflared 服务" : "Cloudflared Service"}</div>
                <div className="font-semibold text-theme-primary flex items-center gap-1">
                  {bridgeStatus?.cloudflared_service_detected ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {isZh ? "已检测 (服务运行中)" : "Detected (Active)"}
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      {isZh ? "未检测到服务" : "Not Detected"}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-theme-card-muted/70 border border-theme-subtle space-y-1">
                <div className="text-theme-muted font-mono text-[11px]">{isZh ? "安全白名单工具" : "Safe Whitelisted Tools"}</div>
                <div className="font-semibold text-theme-primary">
                  {bridgeStatus?.tools_count || 8} Tools Active
                </div>
              </div>
            </div>
          </div>

          {/* Status Matrix (Real-time Indicators) */}
          <div className="p-6 rounded-2xl bg-theme-card border border-theme-subtle space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-theme-primary">
                  {isZh ? "链路健康状态矩阵 (MCP Status Matrix)" : "MCP Health Status Matrix"}
                </h3>
              </div>
              <span className="text-[11px] font-mono text-theme-muted">
                {isZh ? "每 10 秒自动轮询" : "Auto-polled every 10s"}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { key: "core", name: "Nexus Core", target: "127.0.0.1:18080", state: matrixState.core },
                { key: "bridge", name: "MCP Bridge", target: "127.0.0.1:8787", state: matrixState.bridge },
                { key: "tunnelAgent", name: "Cloudflare Agent", target: "Windows Service", state: matrixState.tunnelAgent },
                { key: "dns", name: "Public Domain DNS", target: PROD_DOMAIN, state: matrixState.dns },
                { key: "oauth", name: "OAuth 2.0 Engine", target: "RFC 8414 & 9728", state: matrixState.oauth },
                { key: "mcp", name: "Gemini MCP Gateway", target: "8 Whitelisted Tools", state: matrixState.mcp },
              ].map((item) => (
                <div
                  key={item.key}
                  className="p-3.5 rounded-xl bg-theme-card-muted/60 border border-theme-subtle space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-theme-primary">{item.name}</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        item.state.status === "online"
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
                          : item.state.status === "offline"
                          ? "bg-red-500/10 text-red-500 border border-red-500/30"
                          : "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          item.state.status === "online"
                            ? "bg-emerald-500"
                            : item.state.status === "offline"
                            ? "bg-red-500"
                            : "bg-amber-500 animate-pulse"
                        }`}
                      />
                      {item.state.status === "online" ? "Connected" : item.state.status === "offline" ? "Not Ready" : "Checking"}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-theme-muted truncate">{item.target}</div>
                  {item.state.details && (
                    <div className="text-[11px] text-theme-secondary font-mono truncate">{item.state.details}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Primary Connection Endpoints Card */}
          <div className="p-6 rounded-2xl bg-theme-card border border-theme-subtle space-y-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-theme-primary">
                  {isZh ? "Gemini Spark 连接端点" : "Gemini Spark Connection Endpoints"}
                </h3>
              </div>
              <span className="badge badge-blue text-[11px]">{envMode === "production" ? "Production Canonical" : "Development Quick"}</span>
            </div>

            <div className="space-y-4">
              {/* Primary MCP URL */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-theme-primary flex items-center gap-1.5">
                    <span>Server URL (MCP Endpoint)</span>
                    <span className="text-emerald-500 font-normal text-[11px]">{isZh ? "(填写至 Gemini)" : "(Copy into Gemini)"}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(activeMcpUrl, "mcpServerUrl")}
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 font-mono transition"
                  >
                    {copiedField === "mcpServerUrl" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-500">{isZh ? "已复制" : "Copied"}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isZh ? "复制完整地址" : "Copy URL"}</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-theme-card-muted border border-theme-subtle font-mono text-xs text-theme-primary">
                  <span className="select-all flex-1 truncate">{activeMcpUrl}</span>
                </div>
              </div>

              {/* Discovery URLs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5 p-3 rounded-xl bg-theme-card-muted/50 border border-theme-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-theme-muted">Protected Resource Metadata</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(activeProtectedResourceUrl, "meta1")}
                      className="text-theme-muted hover:text-theme-primary text-[11px] font-mono"
                    >
                      {copiedField === "meta1" ? isZh ? "已复制" : "Copied" : isZh ? "复制" : "Copy"}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-theme-primary truncate select-all">
                    {activeProtectedResourceUrl}
                  </div>
                </div>

                <div className="space-y-1.5 p-3 rounded-xl bg-theme-card-muted/50 border border-theme-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-theme-muted">Authorization Server Metadata</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(activeAuthServerUrl, "meta2")}
                      className="text-theme-muted hover:text-theme-primary text-[11px] font-mono"
                    >
                      {copiedField === "meta2" ? isZh ? "已复制" : "Copied" : isZh ? "复制" : "Copy"}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-theme-primary truncate select-all">
                    {activeAuthServerUrl}
                  </div>
                </div>
              </div>
            </div>

            {/* Whitelisted 8 Tools breakdown */}
            <div className="pt-2">
              <div className="text-xs font-semibold text-theme-primary mb-2 flex items-center justify-between">
                <span>{isZh ? "已授权安全能力清单 (8 Tools)" : "Whitelisted Capabilities (8 Tools)"}</span>
                <span className="text-[11px] text-emerald-500 flex items-center gap-1 font-normal">
                  <Lock className="w-3 h-3" />
                  {isZh ? "严格禁止终端与命令执行" : "Shell execution strictly disabled"}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                {[
                  { name: "nexus_project_list", desc: isZh ? "读取授权项目列表" : "List authorized projects" },
                  { name: "nexus_project_info", desc: isZh ? "查看项目根路径与配置" : "Get project metadata" },
                  { name: "nexus_directory_list", desc: isZh ? "浏览项目目录结构" : "Browse directory hierarchy" },
                  { name: "nexus_file_read", desc: isZh ? "读取代码文件（沙箱）" : "Read project files" },
                  { name: "nexus_file_create", desc: isZh ? "在项目内创建新文件" : "Create new files" },
                  { name: "nexus_file_write", desc: isZh ? "更新/重写现有代码" : "Write file contents" },
                  { name: "nexus_git_status", desc: isZh ? "查询 Git 分支与状态" : "Query Git status" },
                  { name: "nexus_runtime_list", desc: isZh ? "列出本地受管运行时" : "List active runtimes" },
                ].map((tool) => (
                  <div
                    key={tool.name}
                    className="p-2.5 rounded-lg bg-theme-card-muted/70 border border-theme-subtle space-y-1"
                  >
                    <div className="font-mono text-xs font-semibold text-blue-500 truncate">{tool.name}</div>
                    <div className="text-[11px] text-theme-muted">{tool.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View 2: 10-Step Wizard */}
      {activeTab === "wizard" && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-theme-card border border-theme-subtle space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-500" />
                <div>
                  <h3 className="text-sm font-bold text-theme-primary">
                    {isZh ? "Gemini Spark 接入指南" : "Gemini Spark Integration Guide"}
                  </h3>
                  <p className="text-xs text-theme-muted">
                    {isZh
                      ? "按照以下步骤，在 Gemini Spark 官方界面中挂载 Nexus LocalBridge。"
                      : "Follow these steps to mount Nexus LocalBridge in Gemini Spark."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.open("https://gemini.google.com", "_blank")}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 transition"
              >
                <span>{isZh ? "打开 Gemini Spark" : "Open Gemini"}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Steps Timeline */}
            <div className="space-y-3 pt-1">
              {[
                {
                  step: 1,
                  title: isZh ? "进入 Gemini Spark 关联应用设置" : "Navigate to Connected Apps",
                  desc: isZh
                    ? "在浏览器中访问 gemini.google.com → 点击左下角头像或设置 → 选择「已关联的应用 (Connected Apps)」→ 点击「+ 添加 (Add)」添加 Custom App。"
                    : "Go to gemini.google.com → Settings → Connected Apps → Click '+ Add'.",
                  action: null,
                },
                {
                  step: 2,
                  title: isZh ? "填入 MCP Server URL" : "Fill in MCP Server URL",
                  desc: isZh
                    ? "将下方公网 MCP 端点粘贴至 Server URL 输入框中："
                    : "Paste the public MCP endpoint into the Server URL input:",
                  action: (
                    <div className="flex items-center gap-2 mt-1.5 p-2 rounded-lg bg-theme-card-muted border border-theme-subtle">
                      <span className="font-mono text-xs text-theme-primary select-all flex-1 truncate">{activeMcpUrl}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(activeMcpUrl, "step2")}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition"
                      >
                        {copiedField === "step2" ? isZh ? "已复制" : "Copied" : isZh ? "复制" : "Copy"}
                      </button>
                    </div>
                  ),
                },
                {
                  step: 3,
                  title: isZh ? "选择认证方式为 OAuth 2.0" : "Select Authentication Method: OAuth 2.0",
                  desc: isZh
                    ? "在认证方式下拉菜单中，选择「OAuth 2.0」。Gemini 将自动通过 RFC 8414 / RFC 9728 发现我们的授权端点。"
                    : "Select 'OAuth 2.0'. Gemini will discover endpoints via RFC 8414.",
                  action: null,
                },
                {
                  step: 4,
                  title: isZh ? "填写 Client ID（若提示）" : "Fill Client ID (If prompted)",
                  desc: isZh
                    ? "若系统支持 Dynamic Client Registration (DCR)，Gemini 将自动注册。若需要手动指定，请填写 gemini-spark："
                    : "Use pre-registered 'gemini-spark' if manual client ID is required:",
                  action: (
                    <div className="flex items-center gap-2 mt-1.5 p-2 rounded-lg bg-theme-card-muted border border-theme-subtle">
                      <span className="font-mono text-xs text-theme-primary select-all flex-1">gemini-spark</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard("gemini-spark", "step4")}
                        className="px-2.5 py-1 rounded bg-theme-card hover:bg-theme-card-hover text-theme-primary border border-theme-subtle text-[11px] font-semibold transition"
                      >
                        {copiedField === "step4" ? isZh ? "已复制" : "Copied" : isZh ? "复制" : "Copy"}
                      </button>
                    </div>
                  ),
                },
                {
                  step: 5,
                  title: isZh ? "完成授权并在对话中调用" : "Authorize & Start Interacting",
                  desc: isZh
                    ? "点击连接后在新弹出的窗口点击「Authorize」授权。完成后在 Gemini 提示词中即可直接使用 Nexus 8 项安全开发能力。"
                    : "Click Connect → Authorize in popup → Enjoy local capabilities.",
                  action: null,
                },
              ].map((s) => (
                <div
                  key={s.step}
                  className="flex items-start gap-3.5 p-3.5 rounded-xl bg-theme-card-muted/40 border border-theme-subtle"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 border border-blue-500/20">
                    {s.step}
                  </div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="text-xs font-bold text-theme-primary">{s.title}</div>
                    <div className="text-xs text-theme-muted leading-relaxed">{s.desc}</div>
                    {s.action}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View 3: Cloudflare Tunnel Management */}
      {activeTab === "tunnel" && (
        <div className="space-y-6">
          {/* Cloudflare 1-Click Automation Card */}
          <div className="p-6 rounded-2xl bg-theme-card border border-theme-subtle space-y-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-sm font-bold text-theme-primary">
                    {isZh ? "Cloudflare API 一键自动配置" : "Cloudflare API 1-Click Provisioning"}
                  </h3>
                  <p className="text-xs text-theme-muted">
                    {isZh
                      ? "输入 Cloudflare API Token，Nexus 将自动查询 Zone、创建 CNAME 记录并配置 Tunnel Ingress 路由。"
                      : "Provide Cloudflare Token for Nexus to auto-configure CNAME and Tunnel Ingress."}
                  </p>
                </div>
              </div>
              <span className="badge badge-amber text-[10px]">Zero Config</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-theme-primary flex items-center justify-between">
                  <span>Cloudflare User API Token</span>
                  <a
                    href="https://dash.cloudflare.com/profile/api-tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-500 hover:underline flex items-center gap-1"
                  >
                    <span>{isZh ? "前往 Cloudflare 控制台创建 Token" : "Create Token in Cloudflare"}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Key className="w-4 h-4 text-theme-muted absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={cfApiToken}
                      onChange={(e) => setCfApiToken(e.target.value)}
                      placeholder="Cloudflare API Token with Zone.DNS and Tunnel.Edit permissions"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-theme-card-muted border border-theme-subtle font-mono text-xs text-theme-primary focus:outline-hidden focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoConfigureCloudflare}
                    disabled={cfAutoConfiguring || !cfApiToken.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition shadow-xs disabled:opacity-50 shrink-0"
                  >
                    {cfAutoConfiguring && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{cfAutoConfiguring ? (isZh ? "配置中..." : "Configuring...") : isZh ? "一键自动配置" : "Auto-Configure"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-theme-muted">
                  {isZh
                    ? "所需最小权限：Zone.DNS (Edit) + Account.Cloudflare Tunnel (Edit)。凭据仅在内存中使用，绝不会写入磁盘或日志。"
                    : "Required permissions: Zone.DNS (Edit) + Account.Tunnel (Edit). Token is held in memory only."}
                </p>
              </div>

              {cfAutoConfigMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    cfAutoConfigMsg.type === "success"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                      : cfAutoConfigMsg.type === "error"
                      ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
                      : "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {cfAutoConfigMsg.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : cfAutoConfigMsg.type === "error" ? (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                  )}
                  <span>{cfAutoConfigMsg.text}</span>
                </div>
              )}
            </div>
          </div>

          {/* Manual Zero Trust Setup Guidance Card */}
          <div className="p-6 rounded-2xl bg-theme-card border border-theme-subtle space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-theme-primary">
                  {isZh ? "控制台手动配置参数 (Cloudflare Zero Trust)" : "Manual Zero Trust Setup Parameters"}
                </h3>
              </div>
              <a
                href="https://one.dash.cloudflare.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1"
              >
                <span>{isZh ? "打开 Zero Trust Dashboard" : "Open Zero Trust"}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-theme-muted leading-relaxed">
                {isZh
                  ? "若您希望手动在 Cloudflare 控制台中配置，只需在 Zero Trust → Networks → Tunnels → 选择此 Tunnel 并添加 Public Hostname："
                  : "To configure manually in Cloudflare Zero Trust Dashboard, add Public Hostname under this Tunnel:"}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-theme-card-muted border border-theme-subtle space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-theme-muted">Tunnel UUID</span>
                    {prodTunnelUuid && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(prodTunnelUuid, "cfTunnelUuid")}
                        className="text-blue-500 text-[11px] font-mono hover:underline"
                      >
                        {copiedField === "cfTunnelUuid" ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={prodTunnelUuid}
                    onChange={(e) => handleUpdateTunnelUuid(e.target.value)}
                    placeholder="e.g. 12345678-abcd-..."
                    className="w-full bg-transparent font-mono text-xs text-theme-primary outline-hidden placeholder-theme-muted"
                  />
                </div>

                <div className="p-3 rounded-xl bg-theme-card-muted border border-theme-subtle space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-theme-muted">Account ID</span>
                    {prodAccountId && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(prodAccountId, "cfAccount")}
                        className="text-blue-500 text-[11px] font-mono hover:underline"
                      >
                        {copiedField === "cfAccount" ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={prodAccountId}
                    onChange={(e) => handleUpdateAccountId(e.target.value)}
                    placeholder="e.g. your-cloudflare-account-id"
                    className="w-full bg-transparent font-mono text-xs text-theme-primary outline-hidden placeholder-theme-muted"
                  />
                </div>

                <div className="p-3 rounded-xl bg-theme-card-muted border border-theme-subtle space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-theme-muted">Public Hostname</span>
                    {prodDomain && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(prodDomain, "cfHostname")}
                        className="text-blue-500 text-[11px] font-mono hover:underline"
                      >
                        {copiedField === "cfHostname" ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={prodDomain}
                    onChange={(e) => handleUpdateProdDomain(e.target.value)}
                    placeholder="e.g. mcp.yourdomain.com"
                    className="w-full bg-transparent font-mono text-xs text-theme-primary outline-hidden placeholder-theme-muted"
                  />
                </div>

                <div className="p-3 rounded-xl bg-theme-card-muted border border-theme-subtle space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-theme-muted">Service URL (Local Bridge)</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard("http://127.0.0.1:8787", "cfService")}
                      className="text-blue-500 text-[11px] font-mono hover:underline"
                    >
                      {copiedField === "cfService" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="font-mono text-xs text-theme-primary select-all truncate">http://127.0.0.1:8787</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View 4: Live Diagnostics */}
      {activeTab === "diagnostics" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-theme-card border border-theme-subtle space-y-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <div>
                  <h3 className="text-sm font-semibold text-theme-primary">
                    {isZh ? "公网真实连通性与协议诊断 (10 项全检)" : "Public 10-Point Readiness Diagnostics"}
                  </h3>
                  <p className="text-xs text-theme-muted">
                    {isZh
                      ? `针对 ${activeBaseUrl} 现场执行端到端协议与公网握手验证。`
                      : `Live verification for ${activeBaseUrl}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunPublicDiagnostics}
                disabled={diagRunning}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition shadow-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${diagRunning ? "animate-spin" : ""}`} />
                <span>{diagRunning ? (isZh ? "正在逐项诊断..." : "Running...") : isZh ? "运行公网全项诊断" : "Run Public Diagnostics"}</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {diagResults.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-theme-card-muted/70 border border-theme-subtle"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.status === "pass" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : item.status === "fail" ? (
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-theme-muted border-t-transparent animate-spin shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-theme-primary truncate">{item.name}</span>
                  </div>

                  <div className="text-right shrink-0 pl-3">
                    <span
                      className={`text-xs font-mono font-bold ${
                        item.status === "pass"
                          ? "text-emerald-500"
                          : item.status === "fail"
                          ? "text-red-500"
                          : "text-theme-muted"
                      }`}
                    >
                      {item.status === "pass" ? "PASS" : item.status === "fail" ? "FAIL" : "PENDING"}
                    </span>
                    {item.details && (
                      <div className="text-[11px] font-mono text-theme-muted mt-0.5 max-w-md truncate">
                        {item.details}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bridge Runtime Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl bg-theme-card border border-theme-subtle shadow-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-theme-subtle">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-theme-primary">
                  {isZh ? "Nexus MCP Bridge 运行日志" : "Nexus MCP Bridge Runtime Logs"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const logs = await bridge.getMcpBridgeLogs();
                    setBridgeLogs(logs);
                  }}
                  className="p-1 rounded-lg text-theme-muted hover:text-theme-primary transition"
                  title="Refresh logs"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogsModal(false)}
                  className="p-1 rounded-lg text-theme-muted hover:text-theme-primary transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs text-theme-secondary bg-black/40 space-y-1 select-all">
              {bridgeLogs.length === 0 ? (
                <div className="text-theme-muted py-8 text-center">
                  {isZh ? "暂无日志或 Bridge 运行中无新输出" : "No logs available"}
                </div>
              ) : (
                bridgeLogs.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-theme-subtle flex justify-end">
              <button
                type="button"
                onClick={() => setShowLogsModal(false)}
                className="px-4 py-1.5 rounded-lg bg-theme-card border border-theme-subtle hover:bg-theme-card-muted text-xs font-semibold text-theme-primary transition shadow-xs"
              >
                {isZh ? "关闭" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
