import React, { useState } from "react";
import { X, KeyRound, Copy, Check, AlertTriangle } from "lucide-react";
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
  const { t, translateError } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<"mcp" | "runner">("mcp");
  const [scopes, setScopes] = useState<string[]>(["read", "write"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once generated, show secret view
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setName("");
    setType("mcp");
    setScopes(["read", "write"]);
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
              <div>
                <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                  {t.modals.token.scopesLabel}
                </label>
                <div className="flex gap-2">
                  {(["read", "write", "execute"] as const).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => handleToggleScope(scope)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
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
