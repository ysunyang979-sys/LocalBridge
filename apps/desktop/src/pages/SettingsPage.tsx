import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Check,
  RotateCcw,
  Globe,
  SunMoon,
  Server,
  Info,
  Radio,
  KeyRound,
  Play,
  Square,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  Activity,
  Shield,
  User,
  Sliders,
  Zap,
  X,
} from "lucide-react";
import { bridge, type TunnelStatusDto } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { useTheme, type ThemeMode } from "../theme/ThemeContext.js";
import type {
  Project,
  ProjectTrustPolicy,
  ProjectTrustLevel,
  FileActionPolicy,
  ProtectedFilesPolicy,
  ProjectCustomRules,
} from "../types.js";

interface SettingsPageProps {
  tunnelStatus: TunnelStatusDto | null;
  onRefresh: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ tunnelStatus, onRefresh }) => {
  const { t, language, setLanguage } = useTranslation();
  const { themeMode, setThemeMode } = useTheme();

  // Server URL State
  const [serverUrl, setServerUrl] = useState(bridge.getBaseUrl());
  const [saved, setSaved] = useState(false);

  // Tunnel Config State
  const [tunnelId, setTunnelId] = useState(tunnelStatus?.tunnel_id || "");
  const [runtimeApiKey, setRuntimeApiKey] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [isEditingKey, setIsEditingKey] = useState(!tunnelStatus?.has_api_key);
  const [isEditingToken, setIsEditingToken] = useState(!tunnelStatus?.has_mcp_token);
  const [autoReconnect, setAutoReconnect] = useState(tunnelStatus?.auto_reconnect ?? true);
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read", "write"]);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelSuccessMsg, setTunnelSuccessMsg] = useState<string | null>(null);
  const [tunnelErrorMsg, setTunnelErrorMsg] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const defaultCustomRules: ProjectCustomRules = {
    files: {
      read: "allow",
      create: "allow",
      write: "allow",
      patch: "allow",
      delete: "ask",
      rename: "ask",
    },
    commands: {
      build: "ask",
      test: "ask",
      controlledCommand: "ask",
    },
  };

  // Projects & Trust Policy State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [trustPolicy, setTrustPolicy] = useState<ProjectTrustPolicy>({
    trustLevel: "standard",
    filePolicy: "ask",
    commandPolicy: "ask",
    protectedFilesPolicy: "always-ask",
  });
  const [operatorDisplayName, setOperatorDisplayName] = useState<string>("本机用户");
  const [operatorSaved, setOperatorSaved] = useState(false);
  const [showFullTrustModal, setShowFullTrustModal] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policySavedMsg, setPolicySavedMsg] = useState<string | null>(null);
  const [policyErrorMsg, setPolicyErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    bridge.listProjects().then((res) => {
      setProjects(res.projects);
      if (res.projects.length > 0 && !selectedProjectId) {
        setSelectedProjectId(res.projects[0].id);
      }
    }).catch(() => {});

    bridge.getOperatorDisplayName().then((res) => {
      if (res.displayName) {
        setOperatorDisplayName(res.displayName);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    bridge.getProjectTrustPolicy(selectedProjectId).then((res) => {
      if (res.trustPolicy) {
        setTrustPolicy(res.trustPolicy);
      }
    }).catch(() => {
      setTrustPolicy({
        trustLevel: "standard",
        filePolicy: "ask",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      });
    });
  }, [selectedProjectId]);

  const handleSaveOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await bridge.setOperatorDisplayName(operatorDisplayName);
      setOperatorSaved(true);
      setTimeout(() => setOperatorSaved(false), 2000);
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  const handleSelectTrustLevel = (level: ProjectTrustLevel) => {
    if (level === "full-project-trust") {
      setShowFullTrustModal(true);
      return;
    }
    setTrustPolicy((prev) => ({
      ...prev,
      trustLevel: level,
      filePolicy: level === "session-trusted" ? "allow" : "ask",
      customRules: level === "custom" ? (prev.customRules || defaultCustomRules) : prev.customRules,
    }));
  };

  const confirmFullProjectTrust = () => {
    setTrustPolicy((prev) => ({
      ...prev,
      trustLevel: "full-project-trust",
      filePolicy: "allow",
    }));
    setShowFullTrustModal(false);
  };

  const handleSavePolicy = async () => {
    if (!selectedProjectId) return;
    setPolicyBusy(true);
    setPolicySavedMsg(null);
    setPolicyErrorMsg(null);
    try {
      const payload: ProjectTrustPolicy = {
        trustLevel: trustPolicy.trustLevel,
        filePolicy:
          trustPolicy.trustLevel === "full-project-trust" ||
          trustPolicy.trustLevel === "session-trusted"
            ? "allow"
            : "ask",
        commandPolicy: trustPolicy.commandPolicy ?? "ask",
        protectedFilesPolicy: trustPolicy.protectedFilesPolicy ?? "always-ask",
        customRules:
          trustPolicy.trustLevel === "custom"
            ? (trustPolicy.customRules ?? defaultCustomRules)
            : undefined,
      };

      await bridge.setProjectTrustPolicy(selectedProjectId, payload);
      setPolicySavedMsg(t.trust.policySaved);
      setTimeout(() => setPolicySavedMsg(null), 3000);
      onRefresh();
    } catch (err: any) {
      console.error("Failed to save project trust policy:", err);
      const errMsg = err?.message || String(err);
      if (
        errMsg.includes("Invalid parameters") ||
        errMsg.includes("INVALID_REQUEST") ||
        errMsg.includes("invalid-parameter")
      ) {
        setPolicyErrorMsg(t.trust.saveErrorInvalidCombination);
      } else {
        setPolicyErrorMsg(errMsg);
      }
      setTimeout(() => setPolicyErrorMsg(null), 6000);
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleResetAllDefaults = async () => {
    if (!confirm(t.trust.resetAllDefaultsConfirm)) return;
    setPolicyBusy(true);
    try {
      await bridge.resetTrustPoliciesToDefaults();
      if (selectedProjectId) {
        const res = await bridge.getProjectTrustPolicy(selectedProjectId);
        if (res.trustPolicy) setTrustPolicy(res.trustPolicy);
      }
      setPolicySavedMsg(t.trust.resetSuccess);
      setTimeout(() => setPolicySavedMsg(null), 3000);
      onRefresh();
    } catch (err: any) {
      alert(err.message || String(err));
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleClearAllSessions = async () => {
    if (!confirm(t.trust.clearAllSessionsConfirm)) return;
    setPolicyBusy(true);
    try {
      await bridge.clearAllSessionTrust();
      setPolicySavedMsg(t.trust.clearSuccess);
      setTimeout(() => setPolicySavedMsg(null), 3000);
      onRefresh();
    } catch (err: any) {
      alert(err.message || String(err));
    } finally {
      setPolicyBusy(false);
    }
  };

  // Diagnostic secret redaction helper
  const redactSecrets = (text: string | null | undefined): string => {
    if (!text) return "";
    return text
      .replace(/\b(lb_[a-zA-Z0-9_-]{3})[a-zA-Z0-9_-]*/g, "$1***")
      .replace(/\b(lbr_[a-zA-Z0-9_-]{3})[a-zA-Z0-9_-]*/g, "$1***")
      .replace(/\b(lm_[a-zA-Z0-9_-]{3})[a-zA-Z0-9_-]*/g, "$1***")
      .replace(/Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      .replace(/(Authorization:\s*)[^\r\n]+/gi, "$1[REDACTED]")
      .replace(/(api[-_]?key[=:\s]+)[a-zA-Z0-9._~+/-]+/gi, "$1[REDACTED]");
  };

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
  }, [tunnelStatus]);

  const handleSaveServer = (e: React.FormEvent) => {
    e.preventDefault();
    bridge.setBaseUrl(serverUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  const handleResetServer = () => {
    bridge.setBaseUrl("http://127.0.0.1:18080");
    setServerUrl("http://127.0.0.1:18080");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  // Helper for user-friendly, secret-safe error mapping
  const formatTunnelError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes("missing required key") || raw.includes("invalid args")) {
      return `${t.tunnel.errorConfigFailed} (IPC_ARGUMENT_ERROR)`;
    }
    if (raw.includes("401") || raw.includes("403") || raw.includes("Unauthorized") || raw.includes("Authentication")) {
      return `${t.tunnel.errorAuthFailed} (TUNNEL_AUTH_FAILED)`;
    }
    if (raw.includes("Health port") || raw.includes("already in use") || raw.includes("conflict")) {
      return `${t.tunnel.errorPortConflict} (HEALTH_PORT_CONFLICT)`;
    }
    // Redact any raw token strings from error messages
    return raw
      .replace(/lb_[a-f0-9]{32,64}/gi, "lb_***")
      .replace(/lbr_[a-f0-9]{32,64}/gi, "lbr_***")
      .replace(/lm_[a-f0-9]{32,64}/gi, "lm_***");
  };

  // Tunnel Actions
  const handleSaveTunnel = async (andStart: boolean) => {
    setTunnelBusy(true);
    setTunnelSuccessMsg(null);
    setTunnelErrorMsg(null);
    try {
      await bridge.tunnel.saveConfig({
        tunnelId: tunnelId.trim(),
        runtimeApiKey: runtimeApiKey.trim() || undefined,
        mcpToken: mcpToken.trim() || undefined,
        autoReconnect,
        connectNow: andStart,
      });

      setTunnelSuccessMsg(t.tunnel.configuredSuccess);
      setIsEditingKey(false);
      setIsEditingToken(false);
      setRuntimeApiKey("");
      setMcpToken("");
      setTimeout(() => setTunnelSuccessMsg(null), 3000);
      onRefresh();
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
      await bridge.tunnel.autoCreateToken(tokenScopes);
      setTunnelSuccessMsg(t.tunnel.autoCreateTokenSuccess);
      setIsEditingToken(false);
      setTimeout(() => setTunnelSuccessMsg(null), 3000);
      onRefresh();
    } catch (err: unknown) {
      setTunnelErrorMsg(formatTunnelError(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleStartTunnel = async () => {
    setTunnelBusy(true);
    setTunnelErrorMsg(null);
    try {
      await bridge.tunnel.start();
      onRefresh();
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
      onRefresh();
    } catch (err: unknown) {
      setTunnelErrorMsg(formatTunnelError(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleClearTunnel = async () => {
    if (!confirm(t.tunnel.removeBtn + "?")) return;
    setTunnelBusy(true);
    setTunnelErrorMsg(null);
    try {
      await bridge.tunnel.clearConfig();
      setTunnelId("");
      setRuntimeApiKey("");
      setMcpToken("");
      setIsEditingKey(true);
      setIsEditingToken(true);
      onRefresh();
    } catch (err: unknown) {
      setTunnelErrorMsg(formatTunnelError(err));
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleTestConnection = async () => {
    setTunnelBusy(true);
    setTestResult(null);
    try {
      const res = await bridge.testTunnelConnection();
      if (res.mcpServerOnline) {
        setTestResult({
          success: true,
          message: t.tunnel.testSuccess,
        });
      } else {
        setTestResult({
          success: false,
          message: t.tunnel.testFailed,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || String(err),
      });
    } finally {
      setTunnelBusy(false);
    }
  };

  const toggleScope = (scope: string) => {
    setTokenScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const getStatusBadge = () => {
    const s = tunnelStatus?.status;
    if (s === "Connected" && tunnelStatus?.configured) {
      return (
        <span className="badge badge-emerald flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {t.tunnel.chatGptReady}
        </span>
      );
    }
    if (s === "Starting") {
      return <span className="badge badge-blue">{t.tunnel.statusStarting}</span>;
    }
    if (s === "Connecting") {
      return <span className="badge badge-blue">{t.tunnel.statusConnecting}</span>;
    }
    if (s === "Reconnecting") {
      return <span className="badge badge-amber">{t.tunnel.statusReconnecting}</span>;
    }
    if (s === "AuthenticationError") {
      return <span className="badge badge-red">{t.tunnel.statusAuthError}</span>;
    }
    if (s === "NeedsAttention") {
      return <span className="badge badge-red">{t.tunnel.statusNeedsAttention}</span>;
    }
    if (s === "RuntimeMissing") {
      return <span className="badge badge-red">{t.tunnel.statusMissingRuntime}</span>;
    }
    if (s === "HealthPortConflict") {
      return <span className="badge badge-red">{t.tunnel.statusPortConflict}</span>;
    }
    if (s === "LocalMcpUnavailable") {
      return <span className="badge badge-red">{t.tunnel.statusMcpUnavailable}</span>;
    }
    if (s === "Error") {
      return <span className="badge badge-red">{t.tunnel.statusError}</span>;
    }
    if (s === "Stopped") {
      return <span className="badge badge-slate">{t.tunnel.statusStopped}</span>;
    }
    return <span className="badge badge-slate">{t.tunnel.statusNotConfigured}</span>;
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-theme-primary">{t.settings.title}</h2>
        <p className="text-xs text-theme-muted">{t.settings.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Secure MCP Tunnel (P0) */}
        <div className="space-y-6">
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
                <Radio className="w-4 h-4 text-sky-500" />
                <span>{t.tunnel.cardTitle}</span>
              </div>
              {getStatusBadge()}
            </div>

            <p className="text-xs text-theme-muted">{t.tunnel.cardDesc}</p>

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
                <span>{redactSecrets(tunnelErrorMsg)}</span>
              </div>
            )}
            {/* Transient reconnect notice (Amber, gentle, non-alarmist) */}
            {tunnelStatus?.status === "Reconnecting" && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-500 text-xs font-medium">
                <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                <span>{t.tunnel.reconnectingNotice}</span>
              </div>
            )}
            {/* Actionable error banner (Red only for genuine attention required) */}
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
                        ? t.tunnel.errorAuthFailed
                        : tunnelStatus?.status === "HealthPortConflict"
                          ? t.tunnel.errorPortConflict
                          : t.tunnel.needsAttentionNotice)}
                  </span>
                </div>
              )}
            {testResult && (
              <div
                className={`p-3 rounded-lg flex items-center gap-2 text-xs font-medium ${
                  testResult.success
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-500"
                    : "bg-red-500/10 border border-red-500/30 text-red-500"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Tunnel Form Fields */}
            <div className="space-y-4">
              {/* Tunnel ID */}
              <div>
                <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                  {t.tunnel.tunnelIdLabel}
                </label>
                <input
                  type="text"
                  value={tunnelId}
                  onChange={(e) => setTunnelId(e.target.value)}
                  placeholder={t.tunnel.tunnelIdPlaceholder}
                  className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs font-mono text-theme-primary focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Runtime API Key */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-theme-secondary">
                    {t.tunnel.runtimeApiKeyLabel}
                  </label>
                  {tunnelStatus?.has_api_key && (
                    <button
                      type="button"
                      onClick={() => setIsEditingKey(!isEditingKey)}
                      className="text-[11px] text-indigo-500 hover:text-indigo-400 font-medium"
                    >
                      {isEditingKey ? t.common.cancel : t.tunnel.replaceBtn}
                    </button>
                  )}
                </div>
                {isEditingKey ? (
                  <input
                    type="password"
                    value={runtimeApiKey}
                    onChange={(e) => setRuntimeApiKey(e.target.value)}
                    placeholder={t.tunnel.runtimeApiKeyPlaceholder}
                    className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs font-mono text-theme-primary focus:outline-none focus:border-indigo-500"
                  />
                ) : (
                  <div className="w-full bg-theme-input/50 border border-theme-subtle rounded-lg px-3 py-2 text-xs font-mono text-theme-muted flex items-center justify-between">
                    <span>{t.tunnel.keyConfigured}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  </div>
                )}
              </div>

              {/* Local MCP Token */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-theme-secondary">
                    {t.tunnel.mcpTokenLabel}
                  </label>
                  {tunnelStatus?.has_mcp_token && (
                    <button
                      type="button"
                      onClick={() => setIsEditingToken(!isEditingToken)}
                      className="text-[11px] text-indigo-500 hover:text-indigo-400 font-medium"
                    >
                      {isEditingToken ? t.common.cancel : t.tunnel.replaceBtn}
                    </button>
                  )}
                </div>
                {isEditingToken ? (
                  <input
                    type="password"
                    value={mcpToken}
                    onChange={(e) => setMcpToken(e.target.value)}
                    placeholder={t.tunnel.mcpTokenPlaceholder}
                    className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs font-mono text-theme-primary focus:outline-none focus:border-indigo-500"
                  />
                ) : (
                  <div className="w-full bg-theme-input/50 border border-theme-subtle rounded-lg px-3 py-2 text-xs font-mono text-theme-muted flex items-center justify-between">
                    <span>{t.tunnel.tokenConfigured}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  </div>
                )}
              </div>

              {/* Dedicated Token Auto-Creator */}
              <div className="p-3.5 bg-theme-card-muted border border-theme-subtle rounded-lg space-y-2.5">
                <div className="text-xs font-medium text-theme-primary flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{t.tunnel.tokenScopesLabel}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["read", "write", "execute"] as const).map((sc) => {
                    const active = tokenScopes.includes(sc);
                    const label =
                      sc === "read"
                        ? t.tunnel.scopeRead
                        : sc === "write"
                          ? t.tunnel.scopeWrite
                          : t.tunnel.scopeExecute;
                    return (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => toggleScope(sc)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                          active
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-theme-input border-theme-input text-theme-secondary hover:border-indigo-500"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={tunnelBusy}
                  onClick={handleAutoCreateToken}
                  className="w-full py-2 bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-indigo-500 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{t.tunnel.autoCreateTokenBtn}</span>
                </button>
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
                  {t.tunnel.autoReconnectLabel}
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-theme-subtle">
              <button
                type="button"
                disabled={tunnelBusy || !tunnelId.trim()}
                onClick={() => handleSaveTunnel(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition shadow-sm"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{t.tunnel.saveAndConnectBtn}</span>
              </button>

              <button
                type="button"
                disabled={tunnelBusy}
                onClick={handleTestConnection}
                className="flex items-center gap-1.5 px-3 py-2 bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle rounded-lg text-xs font-medium transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${tunnelBusy ? "animate-spin" : ""}`} />
                <span>{t.tunnel.testConnectionBtn}</span>
              </button>

              {tunnelStatus?.status === "Connected" ? (
                <button
                  type="button"
                  disabled={tunnelBusy}
                  onClick={handleStopTunnel}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 border border-amber-500/30 rounded-lg text-xs font-medium transition"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>{t.tunnel.disconnectBtn}</span>
                </button>
              ) : tunnelStatus?.configured ? (
                <button
                  type="button"
                  disabled={tunnelBusy}
                  onClick={handleStartTunnel}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-500 border border-emerald-500/30 rounded-lg text-xs font-medium transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{t.tunnel.connectBtn}</span>
                </button>
              ) : null}

              {tunnelStatus?.configured && (
                <button
                  type="button"
                  disabled={tunnelBusy}
                  onClick={handleClearTunnel}
                  className="flex items-center gap-1.5 px-3 py-2 text-red-500 hover:bg-red-500/10 rounded-lg text-xs font-medium transition ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.tunnel.removeBtn}</span>
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
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDiagnostics ? "rotate-180" : ""}`} />
                <span>{showDiagnostics ? t.tunnel.hideDiagnostics : t.tunnel.viewDiagnostics}</span>
              </button>

              {showDiagnostics && (
                <div className="mt-3 p-3.5 bg-theme-card-muted border border-theme-subtle rounded-lg space-y-2.5 text-xs">
                  <div className="font-semibold text-theme-primary text-xs flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{t.tunnel.diagnosticsTitle}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div>
                      <span className="text-theme-muted">{t.tunnel.diagProcess}:</span>{" "}
                      <span className="text-theme-primary">
                        {tunnelStatus?.status === "Connected"
                          ? "Running (Active)"
                          : tunnelStatus?.status === "Connecting" || tunnelStatus?.status === "Starting"
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
                      <span className="text-theme-muted">{t.tunnel.diagLocalHealth}:</span>{" "}
                      <span className="text-theme-primary">
                        {tunnelStatus?.status === "Connected"
                          ? `OK (Port ${tunnelStatus.health_port})`
                          : tunnelStatus?.status === "HealthPortConflict"
                            ? `Conflict (Port ${tunnelStatus?.health_port || 8080})`
                            : `Standby (Port ${tunnelStatus?.health_port || 8080})`}
                      </span>
                    </div>
                    <div>
                      <span className="text-theme-muted">{t.tunnel.diagControlPlane}:</span>{" "}
                      <span className="text-theme-primary">
                        {tunnelStatus?.status === "Connected"
                          ? "Connected"
                          : tunnelStatus?.status === "Reconnecting"
                            ? "Reconnecting..."
                            : tunnelStatus?.status === "Connecting"
                              ? "Connecting..."
                              : tunnelStatus?.status === "AuthenticationError"
                                ? "Auth Failed (401/403)"
                                : "Disconnected"}
                      </span>
                    </div>
                    <div>
                      <span className="text-theme-muted">{t.tunnel.diagMcpSession}:</span>{" "}
                      <span className="text-theme-primary">
                        {tunnelStatus?.status === "Connected"
                          ? "Active / Ready"
                          : tunnelStatus?.status === "LocalMcpUnavailable"
                            ? "Offline (503)"
                            : "Inactive"}
                      </span>
                    </div>
                    <div>
                      <span className="text-theme-muted">{t.tunnel.diagReconnectAttempts}:</span>{" "}
                      <span className="text-theme-primary">{tunnelStatus?.reconnect_attempts ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-theme-muted">{t.tunnel.diagChildExitCode}:</span>{" "}
                      <span className="text-theme-primary">
                        {tunnelStatus?.error_message?.includes("exit code")
                          ? (tunnelStatus.error_message.match(/exit code[:\s]+(\d+)/i)?.[1] ?? "Non-zero")
                          : "0 (OK)"}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-theme-subtle">
                    <div className="text-[11px] text-theme-muted mb-1">{t.tunnel.diagLastError}:</div>
                    <div className="p-2 bg-theme-card rounded border border-theme-subtle text-[11px] font-mono break-all text-theme-secondary">
                      {redactSecrets(tunnelStatus?.error_message) || (language === "zh-CN" ? "无" : "None")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Server Connection */}
          <form
            onSubmit={handleSaveServer}
            className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm"
          >
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <Server className="w-4 h-4 text-indigo-500" />
              <span>{t.settings.serverConnectionGroup}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                {t.settings.serverUrlLabel}
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs font-mono text-theme-primary focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-theme-muted mt-1">{t.settings.serverUrlHelp}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
              >
                {saved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>{t.common.saved}</span>
                  </>
                ) : (
                  <span>{t.settings.saveChanges}</span>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetServer}
                className="flex items-center gap-1 px-3 py-2 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs font-medium border border-theme-subtle transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.settings.resetDefault}</span>
              </button>
            </div>
          </form>

          {/* Local Operator Settings */}
          <form
            onSubmit={handleSaveOperator}
            className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm"
          >
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <User className="w-4 h-4 text-indigo-500" />
              <span>{t.trust.operatorSettingsTitle}</span>
            </div>
            <p className="text-xs text-theme-muted">{t.trust.operatorSettingsDesc}</p>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                {t.trust.operatorDisplayNameLabel}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={operatorDisplayName}
                  onChange={(e) => setOperatorDisplayName(e.target.value)}
                  placeholder="本机用户"
                  className="flex-1 bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs font-medium text-theme-primary focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition shrink-0"
                >
                  {operatorSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>{t.common.saved}</span>
                    </>
                  ) : (
                    <span>{t.common.save}</span>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-theme-muted mt-1">{t.trust.operatorDisplayNameHelp}</p>
            </div>
          </form>

          {/* Trust & Approval Policy */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
                <Shield className="w-4 h-4 text-indigo-500" />
                <span>{t.trust.title}</span>
              </div>
              {policySavedMsg && (
                <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {policySavedMsg}
                </span>
              )}
            </div>
            <p className="text-xs text-theme-muted">{t.trust.subtitle}</p>

            {/* Target Project Dropdown */}
            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                {t.trust.selectProject}
              </label>
              {projects.length === 0 ? (
                <div className="p-3 bg-theme-card-muted rounded-lg text-xs text-theme-muted border border-theme-subtle">
                  {t.projects.noProjectsDesc}
                </div>
              ) : (
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-indigo-500"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.root || p.id})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedProjectId && (
              <div className="space-y-4 pt-2">
                {/* Trust Level Cards */}
                <div>
                  <label className="block text-xs font-medium text-theme-secondary mb-2">
                    {t.trust.currentTrustLevel}
                  </label>
                  <div className="grid grid-cols-1 gap-2.5">
                    {/* Standard */}
                    <div
                      onClick={() => handleSelectTrustLevel("standard")}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                        trustPolicy.trustLevel === "standard"
                          ? "bg-indigo-500/10 border-indigo-500"
                          : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            trustPolicy.trustLevel === "standard"
                              ? "border-indigo-500 bg-indigo-500"
                              : "border-theme-muted"
                          }`}
                        >
                          {trustPolicy.trustLevel === "standard" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs text-theme-primary">
                          {t.trust.levelStandard}
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          {t.trust.levelStandardDesc}
                        </div>
                      </div>
                    </div>

                    {/* Session Trusted */}
                    <div
                      onClick={() => handleSelectTrustLevel("session-trusted")}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                        trustPolicy.trustLevel === "session-trusted"
                          ? "bg-indigo-500/10 border-indigo-500"
                          : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            trustPolicy.trustLevel === "session-trusted"
                              ? "border-indigo-500 bg-indigo-500"
                              : "border-theme-muted"
                          }`}
                        >
                          {trustPolicy.trustLevel === "session-trusted" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs text-theme-primary">
                          {t.trust.levelSession}
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          {t.trust.levelSessionDesc}
                        </div>
                      </div>
                    </div>

                    {/* Full Project Trust */}
                    <div
                      onClick={() => handleSelectTrustLevel("full-project-trust")}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                        trustPolicy.trustLevel === "full-project-trust"
                          ? "bg-amber-500/10 border-amber-500"
                          : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            trustPolicy.trustLevel === "full-project-trust"
                              ? "border-amber-500 bg-amber-500"
                              : "border-theme-muted"
                          }`}
                        >
                          {trustPolicy.trustLevel === "full-project-trust" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs text-theme-primary flex items-center gap-1.5">
                          <span>{t.trust.levelFull}</span>
                          <span className="badge badge-amber text-[10px]">Persistent</span>
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          {t.trust.levelFullDesc}
                        </div>
                      </div>
                    </div>

                    {/* Custom */}
                    <div
                      onClick={() => handleSelectTrustLevel("custom")}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                        trustPolicy.trustLevel === "custom"
                          ? "bg-indigo-500/10 border-indigo-500"
                          : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            trustPolicy.trustLevel === "custom"
                              ? "border-indigo-500 bg-indigo-500"
                              : "border-theme-muted"
                          }`}
                        >
                          {trustPolicy.trustLevel === "custom" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs text-theme-primary">
                          {t.trust.levelCustom}
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          {t.trust.levelCustomDesc}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Custom Rules Matrix */}
                {trustPolicy.trustLevel === "custom" && (
                  <div className="p-3.5 bg-theme-card-muted border border-theme-subtle rounded-lg space-y-3 text-xs">
                    <div className="font-semibold text-theme-primary flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{t.trust.levelCustom} Matrix</span>
                    </div>

                    {/* Files rules */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-theme-secondary">
                        {t.trust.filePolicyTitle}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        {(["read", "create", "write", "patch", "delete", "rename"] as const).map(
                          (action) => (
                            <div
                              key={action}
                              className="flex items-center justify-between p-1.5 bg-theme-card rounded border border-theme-subtle"
                            >
                              <span className="font-mono text-theme-primary">file.{action}</span>
                              <select
                                value={
                                  trustPolicy.customRules?.files?.[action] ??
                                  (action === "delete" || action === "rename"
                                    ? "ask"
                                    : "allow")
                                }
                                onChange={(e) => {
                                  const val = e.target.value as FileActionPolicy;
                                  setTrustPolicy((prev) => ({
                                    ...prev,
                                    customRules: {
                                      ...prev.customRules,
                                      files: {
                                        ...prev.customRules?.files,
                                        [action]: val,
                                      },
                                    },
                                  }));
                                }}
                                className="bg-theme-input border border-theme-input rounded px-1.5 py-0.5 text-[10px] text-theme-primary"
                              >
                                <option value="allow">Allow</option>
                                <option value="ask">Ask</option>
                                <option value="deny">Deny</option>
                              </select>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* Command rules */}
                    <div className="space-y-1.5 pt-2 border-t border-theme-subtle">
                      <div className="text-[11px] font-medium text-theme-secondary">
                        {t.trust.commandPolicyTitle}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        {(["build", "test", "controlledCommand"] as const).map((cmd) => (
                          <div
                            key={cmd}
                            className="flex items-center justify-between p-1.5 bg-theme-card rounded border border-theme-subtle"
                          >
                            <span className="font-mono text-theme-primary">{cmd}</span>
                            <select
                              value={
                                trustPolicy.customRules?.commands?.[cmd] ?? "ask"
                              }
                              onChange={(e) => {
                                const val = e.target.value as FileActionPolicy;
                                setTrustPolicy((prev) => ({
                                  ...prev,
                                  customRules: {
                                    ...prev.customRules,
                                    commands: {
                                      ...prev.customRules?.commands,
                                      [cmd]: val,
                                    },
                                  },
                                }));
                              }}
                              className="bg-theme-input border border-theme-input rounded px-1.5 py-0.5 text-[10px] text-theme-primary"
                            >
                              <option value="allow">{t.trust.commandAllow}</option>
                              <option value="ask">{t.trust.commandAsk}</option>
                              <option value="deny">{t.trust.commandDeny}</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Protected Files Policy Selector */}
                <div className="pt-2">
                  <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                    {t.trust.protectedFilesTitle}
                  </label>
                  <p className="text-[11px] text-theme-muted mb-2">
                    {t.trust.protectedFilesDesc}
                  </p>
                  <select
                    value={trustPolicy.protectedFilesPolicy}
                    onChange={(e) =>
                      setTrustPolicy((prev) => ({
                        ...prev,
                        protectedFilesPolicy: e.target.value as ProtectedFilesPolicy,
                      }))
                    }
                    className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-indigo-500"
                  >
                    <option value="always-ask">{t.trust.protectedAlwaysAsk}</option>
                    <option value="deny">{t.trust.protectedDeny}</option>
                    <option value="follow-policy">{t.trust.protectedFollowPolicy}</option>
                  </select>
                </div>

                {/* Save Policy Button & Status */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={policyBusy}
                      onClick={handleSavePolicy}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t.common.save}</span>
                    </button>
                  </div>
                  {policySavedMsg && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-500 text-xs font-medium flex items-center gap-2">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{policySavedMsg}</span>
                    </div>
                  )}
                  {policyErrorMsg && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{policyErrorMsg}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Global Trust Controls */}
            <div className="pt-4 border-t border-theme-subtle flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={policyBusy}
                onClick={handleResetAllDefaults}
                className="flex items-center gap-1 px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs font-medium border border-theme-subtle transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.trust.resetAllDefaultsBtn}</span>
              </button>

              <button
                type="button"
                disabled={policyBusy}
                onClick={handleClearAllSessions}
                className="flex items-center gap-1 px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-amber-500 rounded-lg text-xs font-medium border border-theme-subtle transition"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{t.trust.clearAllSessionsBtn}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: General, Security & About */}
        <div className="space-y-6">
          {/* General: Language */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <Globe className="w-4 h-4 text-indigo-500" />
              <span>{t.settings.generalGroup}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-2">
                {t.settings.languageLabel}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLanguage("zh-CN")}
                  className={`p-3 rounded-lg border text-xs font-medium transition text-left ${
                    language === "zh-CN"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-theme-input border-theme-input text-theme-secondary hover:border-indigo-500"
                  }`}
                >
                  <div className="font-semibold">{t.settings.languageZh}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">zh-CN</div>
                </button>

                <button
                  type="button"
                  onClick={() => setLanguage("en-US")}
                  className={`p-3 rounded-lg border text-xs font-medium transition text-left ${
                    language === "en-US"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-theme-input border-theme-input text-theme-secondary hover:border-indigo-500"
                  }`}
                >
                  <div className="font-semibold">{t.settings.languageEn}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">en-US</div>
                </button>
              </div>
            </div>
          </div>

          {/* Appearance: Theme */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <SunMoon className="w-4 h-4 text-indigo-500" />
              <span>{t.settings.appearanceGroup}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-2">
                {t.settings.themeLabel}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(["system", "light", "dark"] as ThemeMode[]).map((mode) => {
                  const label =
                    mode === "system"
                      ? t.settings.themeSystem
                      : mode === "light"
                        ? t.settings.themeLight
                        : t.settings.themeDark;
                  const active = themeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setThemeMode(mode)}
                      className={`p-3 rounded-lg border text-xs font-medium transition text-center ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                          : "bg-theme-input border-theme-input text-theme-secondary hover:border-indigo-500"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Security Architecture Summary */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 text-xs shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>{t.settings.securityTitle}</span>
            </div>

            <ul className="space-y-3 text-theme-secondary list-disc list-inside">
              <li>
                <strong className="text-theme-primary">{t.settings.loopbackGuarantee}:</strong>{" "}
                {t.settings.loopbackGuaranteeDesc}
              </li>
              <li>
                <strong className="text-theme-primary">{t.settings.sandboxGuarantee}:</strong>{" "}
                {t.settings.sandboxGuaranteeDesc}
              </li>
              <li>
                <strong className="text-theme-primary">{t.settings.approvalGuarantee}:</strong>{" "}
                {t.settings.approvalGuaranteeDesc}
              </li>
              <li>
                <strong className="text-theme-primary">{t.settings.killswitchGuarantee}:</strong>{" "}
                {t.settings.killswitchGuaranteeDesc}
              </li>
            </ul>
          </div>

          {/* About Section */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-3 text-xs shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <Info className="w-4 h-4 text-indigo-500" />
              <span>{t.settings.aboutGroup}</span>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <img
                src="/app-icon.png"
                alt="LocalBridge"
                className="w-10 h-10 rounded-lg object-contain shadow-sm"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/favicon.png";
                }}
              />
              <div>
                <div className="font-bold text-sm text-theme-primary">{t.settings.appName}</div>
                <div className="text-theme-muted">
                  {t.settings.versionLabel} 1.2.0 P0 Pre-release &bull; Build {typeof __BUILD_COMMIT__ !== "undefined" ? __BUILD_COMMIT__ : "dev"}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Full Project Trust Confirmation Modal */}
      {showFullTrustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-theme-card border border-amber-500/50 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-amber-500 font-bold text-base">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span>{t.trust.fullTrustWarningTitle}</span>
              </div>
              <button
                onClick={() => setShowFullTrustModal(false)}
                className="text-amber-500 hover:text-amber-600 p-1 rounded-lg hover:bg-amber-500/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-xs text-theme-secondary whitespace-pre-line leading-relaxed">
                {t.trust.fullTrustWarningBody}
              </div>

              <div className="flex gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowFullTrustModal(false)}
                  className="px-4 py-2 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs font-medium transition"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={confirmFullProjectTrust}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t.trust.fullTrustConfirmBtn}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
