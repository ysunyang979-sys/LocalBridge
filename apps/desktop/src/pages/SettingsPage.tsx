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
} from "lucide-react";
import { bridge, type TunnelStatusDto } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { useTheme, type ThemeMode } from "../theme/ThemeContext.js";

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
    if (s === "Connected") {
      return (
        <span className="badge badge-emerald flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {t.tunnel.chatGptReady}
        </span>
      );
    }
    if (s === "Connecting") {
      return <span className="badge badge-amber">{t.tunnel.statusConnecting}</span>;
    }
    if (s === "Reconnecting") {
      return <span className="badge badge-amber">{t.tunnel.statusReconnecting}</span>;
    }
    if (s === "AuthenticationError") {
      return <span className="badge badge-red">{t.tunnel.statusAuthError}</span>;
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

            {/* Error or Success feedback */}
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
            {tunnelStatus?.error_message && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-500 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{tunnelStatus.error_message}</span>
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
                <div className="text-theme-muted">{t.settings.versionLabel} 1.2.0 P0 Pre-release &bull; Build d9510b4</div>
              </div>
            </div>

            <div className="text-[11px] text-theme-muted border-t border-theme-subtle pt-3">
              {t.settings.architectureLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
