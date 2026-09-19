import React, { useState } from "react";
import { X, KeyRound, Copy, Check, AlertTriangle } from "lucide-react";
import { bridge } from "../../api/bridge.js";

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
      setError("Token name is required");
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
      setError(err.message || "Failed to create token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-100 font-semibold">
            <KeyRound className="w-5 h-5 text-indigo-400" />
            <span>Create Authentication Token</span>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {createdToken ? (
          <div className="p-6 space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Save this token now!</strong> It will NEVER be shown again.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Plaintext Token Secret
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={createdToken}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 pr-20 text-xs font-mono text-emerald-400 select-all"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 transition"
              >
                I have saved this token
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Token Name / Description <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Claude Desktop or Local Runner"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Token Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType("mcp")}
                  className={`p-3 rounded-lg border text-left transition ${
                    type === "mcp"
                      ? "bg-indigo-500/15 border-indigo-500 text-slate-100"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="font-semibold text-xs text-indigo-400">
                    MCP Client (AI)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    For Claude Desktop, Cursor, or AI agents (lb_mcp_...)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setType("runner")}
                  className={`p-3 rounded-lg border text-left transition ${
                    type === "runner"
                      ? "bg-indigo-500/15 border-indigo-500 text-slate-100"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="font-semibold text-xs text-cyan-400">
                    Runner Daemon
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    For local runner daemon connection (lb_run_...)
                  </div>
                </button>
              </div>
            </div>

            {type === "mcp" && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Permissions / Scopes
                </label>
                <div className="flex gap-2">
                  {["read", "write", "execute"].map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => handleToggleScope(scope)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                        scopes.includes(scope)
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition"
              >
                {loading ? "Generating..." : "Generate Token"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
