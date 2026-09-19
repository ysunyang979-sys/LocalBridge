import React, { useState } from "react";
import {
  FolderLock,
  Plus,
  Trash2,
  Shield,
  Terminal,
  AlertTriangle,
} from "lucide-react";
import type { Project } from "../types.js";
import { bridge } from "../api/bridge.js";

interface ProjectsPageProps {
  projects: Project[];
  onOpenAuthorizeModal: () => void;
  onRefresh: () => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  onOpenAuthorizeModal,
  onRefresh,
}) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggleEnable = async (project: Project) => {
    setLoadingId(project.id);
    setError(null);
    try {
      if (project.enabled) {
        await bridge.disableProject(project.id);
      } else {
        await bridge.enableProject(project.id);
      }
      onRefresh();
    } catch (err: any) {
      setError(err.message || "Failed to update project status");
    } finally {
      setLoadingId(null);
    }
  };

  const handleToggleAccess = async (project: Project) => {
    setLoadingId(project.id);
    setError(null);
    const newMode = project.accessMode === "read-only" ? "read-write" : "read-only";
    try {
      await bridge.setProjectAccess(project.id, newMode);
      onRefresh();
    } catch (err: any) {
      setError(err.message || "Failed to change access mode");
    } finally {
      setLoadingId(null);
    }
  };

  const handleChangeExecution = async (
    project: Project,
    newMode: "disabled" | "safe-only" | "project-code"
  ) => {
    if (newMode === "project-code") {
      const ok = window.confirm(
        `WARNING: Project Code mode allows running build and test scripts defined in ${project.name}. Untrusted repositories could run malicious code. Proceed?`
      );
      if (!ok) return;
    }

    setLoadingId(project.id);
    setError(null);
    try {
      await bridge.setProjectExecution(project.id, newMode);
      onRefresh();
    } catch (err: any) {
      setError(err.message || "Failed to change execution mode");
    } finally {
      setLoadingId(null);
    }
  };

  const handleRemove = async (projectId: string) => {
    setLoadingId(projectId);
    setError(null);
    try {
      await bridge.removeProject(projectId);
      setDeleteConfirmId(null);
      onRefresh();
    } catch (err: any) {
      setError(err.message || "Failed to remove project");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Authorized Projects</h2>
          <p className="text-xs text-slate-400">
            Control which local folders AI agents can access and what permissions they hold.
          </p>
        </div>
        <button
          onClick={onOpenAuthorizeModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Authorize Folder</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Projects List */}
      {projects.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <FolderLock className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="text-slate-300 font-semibold text-sm">No Projects Authorized</div>
          <p className="text-slate-500 text-xs max-w-md mx-auto">
            AI tools cannot access any local files until you authorize a local folder root.
          </p>
          <button
            onClick={onOpenAuthorizeModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs transition"
          >
            Authorize Your First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {projects.map((project) => {
            const isDeleting = deleteConfirmId === project.id;
            const isLoading = loadingId === project.id;

            return (
              <div
                key={project.id}
                className={`p-5 bg-slate-900 border rounded-xl space-y-4 transition ${
                  project.enabled ? "border-slate-800" : "border-slate-800/40 opacity-70"
                }`}
              >
                {/* Upper Row: Name, Path, and Enable Toggle */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-100 text-base">
                        {project.name}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {project.id}
                      </span>
                      <span
                        className={`badge ${
                          project.enabled ? "badge-green" : "badge-gray"
                        }`}
                      >
                        {project.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800/80 inline-block">
                      {project.root}
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleEnable(project)}
                      disabled={isLoading}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        project.enabled
                          ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                          : "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40"
                      }`}
                    >
                      {project.enabled ? "Disable" : "Enable"}
                    </button>

                    {isDeleting ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRemove(project.id)}
                          disabled={isLoading}
                          className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(project.id)}
                        disabled={isLoading}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                        title="Remove Project Authorization"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Lower Row: Security & Permission Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800/60 text-xs">
                  {/* Access Mode */}
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div>
                      <div className="font-medium text-slate-300 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-slate-400" />
                        Filesystem Access
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        {project.accessMode === "read-only"
                          ? "AI cannot write or delete files"
                          : "AI can modify files within sandbox"}
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleAccess(project)}
                      disabled={isLoading}
                      className={`badge cursor-pointer ${
                        project.accessMode === "read-only"
                          ? "badge-green"
                          : "badge-amber"
                      }`}
                    >
                      {project.accessMode === "read-only" ? "READ ONLY" : "READ WRITE"}
                    </button>
                  </div>

                  {/* Execution Mode */}
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div>
                      <div className="font-medium text-slate-300 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-slate-400" />
                        Command Execution
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        {project.executionMode === "disabled"
                          ? "No commands allowed"
                          : project.executionMode === "safe-only"
                            ? "Safe tool commands only"
                            : "Elevated: project build scripts permitted"}
                      </div>
                    </div>
                    <select
                      value={project.executionMode}
                      onChange={(e) =>
                        handleChangeExecution(
                          project,
                          e.target.value as "disabled" | "safe-only" | "project-code"
                        )
                      }
                      disabled={isLoading}
                      className={`bg-slate-900 border rounded px-2 py-1 text-xs font-medium focus:outline-none ${
                        project.executionMode === "project-code"
                          ? "text-red-400 border-red-500/50"
                          : project.executionMode === "safe-only"
                            ? "text-blue-400 border-blue-500/50"
                            : "text-slate-300 border-slate-700"
                      }`}
                    >
                      <option value="disabled">Disabled</option>
                      <option value="safe-only">Safe Only</option>
                      <option value="project-code">Project Code</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
