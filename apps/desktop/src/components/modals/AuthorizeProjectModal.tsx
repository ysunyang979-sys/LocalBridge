import React, { useState } from "react";
import { X, Folder, AlertTriangle, ShieldAlert } from "lucide-react";
import { bridge } from "../../api/bridge.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface AuthorizeProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthorizeProjectModal: React.FC<AuthorizeProjectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t, translateError } = useTranslation();
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [accessMode, setAccessMode] = useState<"read-only" | "read-write">("read-only");
  const [executionMode, setExecutionMode] = useState<"disabled" | "safe-only" | "project-code">("disabled");
  const [projectCodeConfirmed, setProjectCodeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    try {
      const selected = await bridge.selectDirectory();
      if (selected) {
        setPath(selected);
        if (!name) {
          const parts = selected.replace(/\\/g, "/").split("/");
          setName(parts[parts.length - 1] || "");
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to open directory picker");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!path.trim()) {
      setError(t.modals.authorize.pathRequired);
      return;
    }

    if (executionMode === "project-code" && !projectCodeConfirmed) {
      setError("Please acknowledge the Project Code Execution warning");
      return;
    }

    setLoading(true);
    try {
      const project = await bridge.authorizeProject({
        path: path.trim(),
        name: name.trim() || undefined,
        accessMode,
      });

      if (executionMode !== "disabled") {
        await bridge.setProjectExecution(project.id, executionMode);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-theme-card border border-theme-card rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-2 text-theme-primary font-semibold">
            <Folder className="w-5 h-5 text-indigo-500" />
            <span>{t.modals.authorize.title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-primary p-1 rounded-lg hover:bg-theme-card-hover transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-500 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Path Input with Browse */}
          <div>
            <label className="block text-xs font-medium text-theme-secondary mb-1.5">
              {t.modals.authorize.pathLabel} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={t.modals.authorize.pathPlaceholder}
                className="flex-1 bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-sm text-theme-primary focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="px-3 py-2 bg-theme-card-muted hover:bg-theme-card-hover border border-theme-subtle rounded-lg text-xs font-medium text-theme-secondary transition"
              >
                {t.modals.authorize.browseBtn}
              </button>
            </div>
          </div>

          {/* Project Name */}
          <div>
            <label className="block text-xs font-medium text-theme-secondary mb-1.5">
              {t.modals.authorize.nameLabel}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.modals.authorize.namePlaceholder}
              className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-sm text-theme-primary focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Access Mode */}
          <div>
            <label className="block text-xs font-medium text-theme-secondary mb-1.5">
              {t.modals.authorize.accessModeTitle}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAccessMode("read-only")}
                className={`p-3 rounded-lg border text-left transition ${
                  accessMode === "read-only"
                    ? "bg-emerald-500/15 border-emerald-500/50 text-theme-primary"
                    : "bg-theme-input border-theme-input text-theme-muted hover:border-theme-subtle"
                }`}
              >
                <div className="font-semibold text-xs text-emerald-500">{t.modals.authorize.readOnlyOption}</div>
                <div className="text-[11px] text-theme-muted mt-0.5">
                  {t.modals.authorize.readOnlyOptionDesc}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAccessMode("read-write")}
                className={`p-3 rounded-lg border text-left transition ${
                  accessMode === "read-write"
                    ? "bg-amber-500/15 border-amber-500/50 text-theme-primary"
                    : "bg-theme-input border-theme-input text-theme-muted hover:border-theme-subtle"
                }`}
              >
                <div className="font-semibold text-xs text-amber-500">{t.modals.authorize.readWriteOption}</div>
                <div className="text-[11px] text-theme-muted mt-0.5">
                  {t.modals.authorize.readWriteOptionDesc}
                </div>
              </button>
            </div>
          </div>

          {/* Execution Mode */}
          <div>
            <label className="block text-xs font-medium text-theme-secondary mb-1.5">
              {t.modals.authorize.execModeTitle}
            </label>
            <div className="space-y-2">
              <label
                onClick={() => setExecutionMode("disabled")}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  executionMode === "disabled"
                    ? "bg-indigo-500/15 border-indigo-500/50 text-theme-primary"
                    : "bg-theme-input border-theme-input text-theme-muted hover:border-theme-subtle"
                }`}
              >
                <input
                  type="radio"
                  name="executionMode"
                  checked={executionMode === "disabled"}
                  onChange={() => setExecutionMode("disabled")}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="text-xs font-semibold text-theme-primary">{t.modals.authorize.execDisabledOption}</div>
                  <div className="text-[11px] text-theme-muted">{t.modals.authorize.execDisabledOptionDesc}</div>
                </div>
              </label>

              <label
                onClick={() => setExecutionMode("safe-only")}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  executionMode === "safe-only"
                    ? "bg-indigo-500/15 border-indigo-500/50 text-theme-primary"
                    : "bg-theme-input border-theme-input text-theme-muted hover:border-theme-subtle"
                }`}
              >
                <input
                  type="radio"
                  name="executionMode"
                  checked={executionMode === "safe-only"}
                  onChange={() => setExecutionMode("safe-only")}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="text-xs font-semibold text-theme-primary">{t.modals.authorize.execSafeOnlyOption}</div>
                  <div className="text-[11px] text-theme-muted">{t.modals.authorize.execSafeOnlyOptionDesc}</div>
                </div>
              </label>

              <label
                onClick={() => setExecutionMode("project-code")}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  executionMode === "project-code"
                    ? "bg-red-500/15 border-red-500/50 text-theme-primary"
                    : "bg-theme-input border-theme-input text-theme-muted hover:border-theme-subtle"
                }`}
              >
                <input
                  type="radio"
                  name="executionMode"
                  checked={executionMode === "project-code"}
                  onChange={() => setExecutionMode("project-code")}
                  className="mt-0.5 text-red-600 focus:ring-red-500"
                />
                <div>
                  <div className="text-xs font-semibold text-red-500 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {t.modals.authorize.execProjectCodeOption}
                  </div>
                  <div className="text-[11px] text-theme-muted">
                    {t.modals.authorize.execProjectCodeOptionDesc}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Project Code Warning Acknowledgment */}
          {executionMode === "project-code" && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-red-500 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Security Warning: Arbitrary Code Execution
              </div>
              <p className="text-[11px] text-red-600/90 dark:text-red-300/80 leading-relaxed">
                Allowing Project Code mode permits execution of commands configured in project build scripts (e.g. package.json or Makefiles).
              </p>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={projectCodeConfirmed}
                  onChange={(e) => setProjectCodeConfirmed(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500"
                />
                <span className="text-xs text-red-500 font-medium">
                  I understand the risks and trust this repository
                </span>
              </label>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-theme-subtle flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-theme-secondary hover:bg-theme-card-hover transition"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={loading || (executionMode === "project-code" && !projectCodeConfirmed)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:pointer-events-none transition shadow-sm"
            >
              {loading ? t.modals.authorize.submitting : t.modals.authorize.submitBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
