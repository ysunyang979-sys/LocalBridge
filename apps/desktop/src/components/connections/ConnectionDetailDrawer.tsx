import React, { useState } from "react";
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
} from "lucide-react";
import type { AIConnectionDto, AIConnectionConfig, TestConnectionResult } from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface ConnectionDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  connection: AIConnectionDto | null;
  isPrimary: boolean;
  onSetPrimary: (id: string) => Promise<void>;
  onRotateToken: (id: string, scopes?: string[]) => Promise<void>;
  onTestConnection: (id: string) => Promise<TestConnectionResult>;
  onSaveConfig: (config: AIConnectionConfig) => Promise<void>;
  onDeleteConnection: (id: string) => Promise<void>;
  onPreviewConfig?: (conn: AIConnectionDto) => void;
}

export const ConnectionDetailDrawer: React.FC<ConnectionDetailDrawerProps> = ({
  isOpen,
  onClose,
  connection,
  isPrimary,
  onSetPrimary,
  onRotateToken,
  onTestConnection,
  onSaveConfig,
  onDeleteConnection,
  onPreviewConfig,
}) => {
  const { t } = useTranslation();
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form state for Tool/API adapters
  const [endpoint, setEndpoint] = useState(connection?.endpoint || "");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState((connection?.metadata?.model as string) || "");

  React.useEffect(() => {
    if (connection) {
      setEndpoint(connection.endpoint || "");
      setModel((connection.metadata?.model as string) || "");
      setApiKey("");
      setTestResult(null);
      setSaveSuccess(false);
    }
  }, [connection]);

  if (!isOpen || !connection) return null;

  const isNativeMcp = connection.category === "native-mcp";
  const isCustomOrAdapter = ![
    "conn_chatgpt",
    "conn_kimi_web",
    "conn_kimi",
    "conn_claude",
    "conn_gemini",
  ].includes(connection.id);

  const handleCopyToken = () => {
    if (connection.tokenMasked) {
      navigator.clipboard.writeText(connection.tokenMasked);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleRotateToken = async () => {
    setIsRotating(true);
    try {
      await onRotateToken(connection.id, connection.scopes);
    } finally {
      setIsRotating(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestConnection(connection.id);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const updatedConfig: AIConnectionConfig = {
        id: connection.id,
        clientType: connection.clientType,
        name: connection.name,
        category: connection.category,
        transport: connection.transport,
        endpoint: endpoint.trim() || undefined,
        baseUrl: endpoint.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        model: model.trim() || undefined,
        metadata: {
          ...connection.metadata,
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

  const mcpConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        nexus: {
          url:
            connection.clientType === "kimi-web" || connection.transport === "tunnel"
              ? connection.endpoint || "https://<nexus-tunnel-host>/mcp"
              : "http://127.0.0.1:18080/mcp",
          headers: {
            Authorization: `Bearer ${connection.tokenMasked || "YOUR_NEXUS_TOKEN"}`,
          },
        },
      },
    },
    null,
    2
  );

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(mcpConfigSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl h-full bg-theme-card border-l border-theme-subtle shadow-2xl flex flex-col justify-between overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-theme-subtle flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-theme-primary">
                {connection.name}
              </h2>
              {isPrimary && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  {t.aiConnections?.isPrimary || "Primary"}
                </span>
              )}
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  isNativeMcp
                    ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30"
                    : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                }`}
              >
                {isNativeMcp ? "Native MCP" : "Tool/API Adapter"}
              </span>
            </div>
            <p className="text-xs text-theme-muted font-mono">
              ID: {connection.id} &bull; Transport: {connection.transport}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs font-sans">
          {/* Unified Security Shield Notice */}
          <div className="p-3.5 rounded-xl bg-sky-500/5 border border-sky-500/20 space-y-2">
            <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4 text-sky-500 shrink-0" />
              <span>{t.aiConnections?.securityBanner}</span>
            </div>
            <p className="text-[11px] text-theme-muted font-mono">
              Enforced Gates: Project Trust &bull; User Approvals &bull; Protected Files &bull; Emergency Stop
            </p>
          </div>

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
                {connection.tokenMasked || "lb_••••••••••••••••"}
              </div>
              <button
                onClick={handleCopyToken}
                className="p-2.5 rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition"
                title={copiedToken ? (t.aiConnections?.tokenCopied || "Copied") : (t.aiConnections?.copyToken || "Copy Token")}
              >
                {copiedToken ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            {/* Scopes */}
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-theme-muted">{t.aiConnections?.scopesLabel || "Scopes"}:</span>
              {connection.scopes?.map((scope: string) => (
                <span
                  key={scope}
                  className="px-2 py-0.5 rounded font-mono bg-theme-card-muted text-theme-secondary border border-theme-subtle"
                >
                  {scope}
                </span>
              ))}
            </div>
          </div>

          {/* Config & Parameters Form (if Tool/API adapter) */}
          {!isNativeMcp && (
            <form onSubmit={handleSave} className="space-y-4 p-4 rounded-xl bg-theme-card-muted border border-theme-subtle">
              <div className="font-semibold text-theme-primary text-xs">
                API Model & Endpoint Configuration
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted text-[11px] block font-mono">
                  Base URL / Endpoint
                </label>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted text-[11px] block font-mono">
                  Model Name
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="deepseek-chat / qwen2.5-coder"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted text-[11px] block font-mono">
                  API Key (Stored Securely via DPAPI / Encrypted)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={connection.metadata?.hasApiKey ? "sk-•••••••• (Saved)" : "Enter API Key"}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {saveSuccess && (
                  <span className="text-emerald-500 text-xs flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>{t.common.saved}</span>
                  </span>
                )}
                <button
                  type="submit"
                  disabled={isSaving}
                  className="ml-auto px-4 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition disabled:opacity-50"
                >
                  {isSaving ? t.common.loading : t.common.save}
                </button>
              </div>
            </form>
          )}

          {/* Native MCP Config Snippet */}
          {isNativeMcp && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-theme-primary text-xs">
                  MCP Client Snippet
                </label>
                <button
                  onClick={handleCopySnippet}
                  className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                >
                  {copiedSnippet ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSnippet ? t.common.copied : t.common.copy}</span>
                </button>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 text-zinc-100 border border-zinc-800 text-[11px] font-mono overflow-x-auto">
                <pre>{mcpConfigSnippet}</pre>
              </div>
            </div>
          )}

          {/* Test Connection Diagnostic Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-theme-primary text-xs">
                {t.aiConnections?.testConnection || "Test Connection"}
              </label>
              <button
                onClick={handleTest}
                disabled={isTesting}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isTesting ? "animate-spin" : ""}`} />
                <span>{isTesting ? (t.aiConnections?.testingConnection || "Testing...") : (t.aiConnections?.testConnection || "Test")}</span>
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
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500" />
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
        <div className="p-6 border-t border-theme-subtle bg-theme-card-muted flex items-center justify-between gap-3">
          <div>
            {!isPrimary && (
              <button
                type="button"
                onClick={() => onSetPrimary(connection.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition"
              >
                <Star className="w-3.5 h-3.5" />
                <span>{t.aiConnections?.setAsPrimary || "Set as Primary AI"}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isCustomOrAdapter && (
              <button
                type="button"
                onClick={() => onDeleteConnection(connection.id)}
                className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition"
                title={t.aiConnections?.deleteConnection || "Delete Connection"}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {isNativeMcp &&
              connection.clientType !== "chatgpt" &&
              connection.clientType !== "kimi-web" &&
              onPreviewConfig && (
                <button
                  type="button"
                  onClick={() => onPreviewConfig(connection)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-sky-600 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 transition"
                >
                  {t.aiConnections?.previewConfig || "Preview & Apply"}
                </button>
              )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover border border-theme-subtle transition"
            >
              {t.common.close}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
