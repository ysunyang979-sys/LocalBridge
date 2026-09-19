import React, { useState } from "react";
import { X, Folder, AlertTriangle, ShieldAlert } from "lucide-react";
import { bridge } from "../../api/bridge.js";

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
      setError("Project directory path is required");
      return;
    }

    if (executionMode === "project-code" && !projectCodeConfirmed) {
      setError("You must explicitly acknowledge the Project Code Execution warning");
      return;
    }

    setLoading(true);
    try {
      // 1. Authorize project (creates project with accessMode)
      const project = await bridge.authorizeProject({
        path: path.trim(),
        name: name.trim() || undefined,
        accessMode,
      });

      // 2. Set execution mode if different from disabled
      if (executionMode !== "disabled") {
        await bridge.setProjectExecution(project.id, executionMode);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to authorize project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-100 font-semibold">
            <Folder className="w-5 h-5 text-indigo-400" />
            <span>Authorize Local Project</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Path Input with Browse */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Project Root Directory <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\Projects\my-app or /home/user/my-app"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 transition"
              >
                Browse...
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Path must be a valid directory on the local machine and not a system root.
            </p>
          </div>

          {/* Project Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Project Display Name (Optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. backend-service"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Access Mode */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Filesystem Access Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAccessMode("read-only")}
                className={`p-3 rounded-lg border text-left transition ${
                  accessMode === "read-only"
                    ? "bg-emerald-500/15 border-emerald-500/50 text-slate-100"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="font-semibold text-xs text-emerald-400">Read-Only</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  AI cannot create, modify, or delete files. Safe default.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAccessMode("read-write")}
                className={`p-3 rounded-lg border text-left transition ${
                  accessMode === "read-write"
                    ? "bg-amber-500/15 border-amber-500/50 text-slate-100"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="font-semibold text-xs text-amber-400">Read-Write</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Allows file creation, modification, and deletion within project sandbox.
                </div>
              </button>
            </div>
          </div>

          {/* Execution Mode */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Command Execution Mode
            </label>
            <div className="space-y-2">
              <label
                onClick={() => setExecutionMode("disabled")}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  executionMode === "disabled"
                    ? "bg-indigo-500/15 border-indigo-500/50 text-slate-100"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="executionMode"
                  checked={executionMode === "disabled"}
                  onChange={() => setExecutionMode("disabled")}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Disabled (Default)</div>
                  <div className="text-[11px] text-slate-400">No command or script execution allowed.</div>
                </div>
              </label>

              <label
                onClick={() => setExecutionMode("safe-only")}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  executionMode === "safe-only"
                    ? "bg-indigo-500/15 border-indigo-500/50 text-slate-100"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="executionMode"
                  checked={executionMode === "safe-only"}
                  onChange={() => setExecutionMode("safe-only")}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Safe Only</div>
                  <div className="text-[11px] text-slate-400">
                    Allows pre-approved read-only tool commands (git, npm test, cargo test).
                  </div>
                </div>
              </label>

              <label
                onClick={() => setExecutionMode("project-code")}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  executionMode === "project-code"
                    ? "bg-red-500/15 border-red-500/50 text-slate-100"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="executionMode"
                  checked={executionMode === "project-code"}
                  onChange={() => setExecutionMode("project-code")}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Project Code Execution (Elevated)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Allows project build scripts and test runners. Requires human confirmation.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Project Code Warning Acknowledgment */}
          {executionMode === "project-code" && (
            <div className="p-3 bg-red-950/40 border border-red-800 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-red-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Security Warning: Arbitrary Code Execution
              </div>
              <p className="text-[11px] text-red-200/80 leading-relaxed">
                Allowing Project Code mode permits execution of commands configured in project build scripts (e.g. package.json or Makefiles). Malicious repositories could execute untrusted local binaries.
              </p>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={projectCodeConfirmed}
                  onChange={(e) => setProjectCodeConfirmed(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500"
                />
                <span className="text-xs text-red-300 font-medium">
                  I understand the risks and trust this repository
                </span>
              </label>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (executionMode === "project-code" && !projectCodeConfirmed)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:pointer-events-none transition"
            >
              {loading ? "Authorizing..." : "Authorize Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
