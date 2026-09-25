import React, { useState } from "react";
import { X, KeyRound, Copy, Check, AlertTriangle, Shield } from "lucide-react";
import { bridge } from "../../api/bridge.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface CreateTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateTokenModal: React.FC<CreateTokenModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t, translateError, language } = useTranslation();
  const isZh = language === "zh-CN";
  const [name, setName] = useState("");
  const [type, setType] = useState<"mcp" | "runner">("mcp");
  const [scopes, setScopes] = useState<string[]>(["read", "write", "execute"]);
  const [persistToTunnel, setPersistToTunnel] = useState(true);
  const [persistedSuccess, setPersistedSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once generated, show secret view
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setName("");
    setType("mcp");
    setScopes(["read", "write", "execute"]);
    setPersistToTunnel(true);
    setPersistedSuccess(false);
    setCreatedToken(null);
    setCopied(false);
    setError(null);
    onClose();
  };

  const handleCopy = async () => {
    if (createdToken) {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleToggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t.modals.token.nameRequired);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await bridge.createToken({
        name: name.trim(),
        type,
        scopes,
      });
      setCreatedToken(res.token);
      if (type === "mcp" && persistToTunnel) {
        try {
          await bridge.tunnel.saveMcpToken(res.token);
          setPersistedSuccess(true);
        } catch {
          // Fallback
        }
      }
      onSuccess();
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-theme-card border border-theme-card rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-2 text-theme-primary font-semibold">
            <KeyRound className="w-5 h-5 text-indigo-500" />
            <span>{t.modals.token.title}</span>
          </div>
          <button
            onClick={handleClose}
            className="text-theme-muted hover:text-theme-primary p-1 rounded-lg hover:bg-theme-card-hover transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {createdToken ? (
          <div className="p-6 space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-500 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong>{t.tokens.secretWarningTitle}</strong> {t.tokens.secretWarningDesc}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                {t.tokens.plaintextSecret}
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={createdToken}
                  className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2.5 pr-20 text-xs font-mono text-emerald-500 select-all"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>{t.common.copied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{t.common.copy}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {type === "mcp" && (
              <div className="p-3 rounded-lg border text-xs flex items-center justify-between gap-2 bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <span className="flex items-center gap-1.5 font-medium">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>
                    {persistedSuccess
                      ? (isZh ? "已持久化为当前 ChatGPT 隧道生效令牌 (Windows DPAPI)" : "Saved as active ChatGPT Tunnel token in DPAPI")
                      : (isZh ? "未持久化至 ChatGPT 隧道" : "Not persisted to tunnel")}
                  </span>
                </span>
                {!persistedSuccess && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!createdToken) return;
                      try {
                        await bridge.tunnel.saveMcpToken(createdToken);
                        setPersistedSuccess(true);
                      } catch {}
                    }}
                    className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-semibold transition cursor-pointer shrink-0"
                  >
                    {isZh ? "设为当前隧道令牌" : "Set as Tunnel Token"}
                  </button>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-theme-subtle flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition"
              >
                {t.tokens.savedTokenBtn}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-500 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                {t.modals.token.nameLabel} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.modals.token.namePlaceholder}
                className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-sm text-theme-primary focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                {t.modals.token.typeLabel}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType("mcp")}
                  className={`p-3 rounded-lg border text-left transition ${
                    type === "mcp"
                      ? "bg-indigo-500/15 border-indigo-500 text-theme-primary"
                      : "bg-theme-input border-theme-input text-theme-muted hover:border-theme-subtle"
                  }`}
                >
                  <div className="font-semibold text-xs text-indigo-500">
                    {t.modals.token.typeMcpTitle}
                  </div>
                  <div className="text-[11px] text-theme-muted mt-0.5">
                    {t.modals.token.typeMcpDesc}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setType("runner")}
                  className={`p-3 rounded-lg border text-left transition ${
                    type === "runner"
                      ? "bg-indigo-500/15 border-indigo-500 text-theme-primary"
                      : "bg-theme-input border-theme-input text-theme-muted hover:border-theme-subtle"
                  }`}
                >
                  <div className="font-semibold text-xs text-cyan-500">
                    {t.modals.token.typeRunnerTitle}
                  </div>
                  <div className="text-[11px] text-theme-muted mt-0.5">
                    {t.modals.token.typeRunnerDesc}
                  </div>
                </button>
              </div>
            </div>

            {type === "mcp" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-theme-secondary">
                    {t.modals.token.scopesLabel}
                  </label>
                  <span className="text-[10px] text-theme-muted font-mono">
                    {isZh ? "快捷预设组合：" : "Presets:"}
                  </span>
                </div>

                {/* Scope Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "read_only", label: isZh ? "只读" : "Read-Only", list: ["read"] },
                    { id: "write_only", label: isZh ? "只写" : "Write-Only", list: ["write"] },
                    { id: "read_write", label: isZh ? "读写" : "Read & Write", list: ["read", "write"] },
                    { id: "exec_only", label: isZh ? "执行" : "Execute-Only", list: ["execute"] },
                    { id: "full", label: isZh ? "读写执行 (推荐)" : "Full Control", list: ["read", "write", "execute"] },
                  ].map((preset) => {
                    const isSelected =
                      preset.list.length === scopes.length &&
                      preset.list.every((s) => scopes.includes(s));
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setScopes([...preset.list])}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition cursor-pointer ${
                          isSelected
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                            : "bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border-theme-subtle"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Granular Individual Toggles */}
                <div className="flex gap-2 pt-0.5">
                  {(["read", "write", "execute"] as const).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => handleToggleScope(scope)}
                      className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        scopes.includes(scope)
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                          : "bg-theme-input border-theme-input text-theme-muted hover:text-theme-primary"
                      }`}
                    >
                      {scope === "read"
                        ? t.modals.token.scopeRead
                        : scope === "write"
                          ? t.modals.token.scopeWrite
                          : t.modals.token.scopeExecute}
                    </button>
                  ))}
                </div>

                {/* DPAPI Persistence Option */}
                <label className="flex items-start gap-2.5 cursor-pointer pt-1 bg-sky-500/5 dark:bg-sky-500/10 p-2.5 rounded-lg border border-sky-500/20">
                  <input
                    type="checkbox"
                    checked={persistToTunnel}
                    onChange={(e) => setPersistToTunnel(e.target.checked)}
                    className="mt-0.5 rounded border-theme-subtle text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="space-y-0.5 text-xs text-theme-primary">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      <span>{isZh ? "同时设为 ChatGPT 隧道当前生效令牌并持久化 (DPAPI)" : "Persist as active ChatGPT Tunnel token (DPAPI)"}</span>
                    </span>
                    <span className="block text-[11px] text-theme-muted">
                      {isZh
                        ? "自动加密保存到 Windows DPAPI，使 ChatGPT 与 Secure MCP Tunnel 立即获得读写或命令执行权限"
                        : "Saves securely to DPAPI, allowing ChatGPT & Secure MCP Tunnel to execute commands immediately"}
                    </span>
                  </div>
                </label>
              </div>
            )}

            <div className="pt-4 border-t border-theme-subtle flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-theme-secondary hover:bg-theme-card-hover transition"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition shadow-sm"
              >
                {loading ? t.modals.token.submitting : t.modals.token.submitBtn}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
