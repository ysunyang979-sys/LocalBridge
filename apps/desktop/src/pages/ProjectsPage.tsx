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
import { useTranslation } from "../i18n/useTranslation.js";

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
  const { t, translateError } = useTranslation();
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
      setError(translateError(err.code, err.message));
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
      setError(translateError(err.code, err.message));
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
      setError(translateError(err.code, err.message));
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
      setError(translateError(err.code, err.message));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-theme-primary">{t.projects.title}</h2>
          <p className="text-xs text-theme-muted">{t.projects.subtitle}</p>
        </div>
        <button
          onClick={onOpenAuthorizeModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>{t.projects.authorizeBtn}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Projects List */}
      {projects.length === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
          <FolderLock className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">{t.projects.noProjects}</div>
          <p className="text-theme-muted text-xs max-w-md mx-auto">{t.projects.noProjectsDesc}</p>
          <button
            onClick={onOpenAuthorizeModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition shadow-sm"
          >
            {t.projects.authorizeBtn}
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
                className={`p-5 bg-theme-card border rounded-xl space-y-4 transition shadow-sm ${
                  project.enabled ? "border-theme-card" : "border-theme-subtle opacity-70"
                }`}
              >
                {/* Upper Row: Name, Path, and Enable Toggle */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-theme-primary text-base">
                        {project.name}
                      </span>
                      <span className="font-mono text-xs text-theme-muted">
                        {project.id}
                      </span>
                      <span
                        className={`badge ${
                          project.enabled ? "badge-green" : "badge-amber"
                        }`}
                      >
                        {project.enabled ? t.common.enable : t.common.disable}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-theme-secondary bg-theme-card-muted px-2.5 py-1 rounded border border-theme-subtle inline-block select-all">
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
                          ? "bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border-theme-subtle"
                          : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-500 border-emerald-500/30"
                      }`}
                    >
                      {project.enabled ? t.common.disable : t.common.enable}
                    </button>

                    {isDeleting ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRemove(project.id)}
                          disabled={isLoading}
                          className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                        >
                          {t.common.confirm}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2.5 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs border border-theme-subtle transition"
                        >
                          {t.common.cancel}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(project.id)}
                        disabled={isLoading}
                        className="p-1.5 text-theme-muted hover:text-red-500 hover:bg-theme-card-hover rounded-lg transition"
                        title={t.projects.removeConfirmTitle}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Lower Row: Security & Permission Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-theme-subtle text-xs">
                  {/* Access Mode */}
                  <div className="flex items-center justify-between p-3 bg-theme-card-muted rounded-lg border border-theme-subtle">
                    <div>
                      <div className="font-medium text-theme-primary flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-theme-muted" />
                        {t.projects.accessMode}
                      </div>
                      <div className="text-theme-muted text-[11px] mt-0.5">
                        {project.accessMode === "read-only"
                          ? t.modals.authorize.readOnlyOptionDesc
                          : t.modals.authorize.readWriteOptionDesc}
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
                      {project.accessMode === "read-only"
                        ? t.projects.readOnly
                        : t.projects.readWrite}
                    </button>
                  </div>

                  {/* Execution Mode */}
                  <div className="flex items-center justify-between p-3 bg-theme-card-muted rounded-lg border border-theme-subtle">
                    <div>
                      <div className="font-medium text-theme-primary flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-theme-muted" />
                        {t.projects.executionMode}
                      </div>
                      <div className="text-theme-muted text-[11px] mt-0.5">
                        {project.executionMode === "disabled"
                          ? t.modals.authorize.execDisabledOptionDesc
                          : project.executionMode === "safe-only"
                            ? t.modals.authorize.execSafeOnlyOptionDesc
                            : t.modals.authorize.execProjectCodeOptionDesc}
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
                      className={`bg-theme-input border border-theme-input rounded px-2 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500 ${
                        project.executionMode === "project-code"
                          ? "text-red-500"
                          : project.executionMode === "safe-only"
                            ? "text-blue-500"
                            : "text-theme-secondary"
                      }`}
                    >
                      <option value="disabled">{t.projects.execDisabled}</option>
                      <option value="safe-only">{t.projects.execSafeOnly}</option>
                      <option value="project-code">{t.projects.execProjectCode}</option>
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
