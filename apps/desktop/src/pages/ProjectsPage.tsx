import React, { useState } from "react";
import {
  FolderLock,
  Plus,
  Trash2,
  Shield,
  Terminal,
  AlertTriangle,
  Search,
  ChevronRight,
} from "lucide-react";
import type { Project } from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { ProjectDetailPage } from "./ProjectDetailPage.js";

interface ProjectsPageProps {
  projects: Project[];
  onOpenAuthorizeModal: () => void;
  onRefresh: () => void;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  onOpenAuthorizeModal,
  onRefresh,
  selectedProjectId: propSelectedProjectId,
  onSelectProject,
}) => {
  const { t, translateError } = useTranslation();
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "enabled" | "disabled">("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeSelectedId = propSelectedProjectId !== undefined ? propSelectedProjectId : internalSelectedId;

  const handleSelect = (id: string | null) => {
    if (onSelectProject) {
      onSelectProject(id);
    } else {
      setInternalSelectedId(id);
    }
  };

  // If a project is selected, render the rich detail view
  if (activeSelectedId) {
    return (
      <ProjectDetailPage
        projectId={activeSelectedId}
        onBack={() => handleSelect(null)}
        onRefreshProjects={onRefresh}
      />
    );
  }

  const handleToggleEnable = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleToggleAccess = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleRemove = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  // Filter projects based on search query and status filter
  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.root.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterMode === "enabled") return p.enabled;
    if (filterMode === "disabled") return !p.enabled;
    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-theme-primary tracking-tight">
            {t.projects.title || "Authorized Projects"}
          </h2>
          <p className="text-xs text-theme-muted">
            {t.projects.subtitle ||
              "Local directories authorized for AI tool operations, persistent runtimes, and diagnostics."}
          </p>
        </div>
        <button
          onClick={onOpenAuthorizeModal}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg text-xs shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>{t.projects.authorizeBtn || "Authorize Directory"}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-xs text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects by name, root path, or ID..."
            className="w-full bg-[#0d1320] border border-white/[0.08] rounded-lg pl-9 pr-3 py-1.5 text-xs text-theme-primary focus:outline-none focus:border-sky-500 transition font-mono"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#0d1320] border border-white/[0.08] rounded-lg p-1 text-xs">
          <button
            onClick={() => setFilterMode("all")}
            className={`px-2.5 py-1 rounded font-medium transition ${
              filterMode === "all"
                ? "bg-white/[0.1] text-white"
                : "text-theme-muted hover:text-theme-secondary"
            }`}
          >
            All ({projects.length})
          </button>
          <button
            onClick={() => setFilterMode("enabled")}
            className={`px-2.5 py-1 rounded font-medium transition ${
              filterMode === "enabled"
                ? "bg-white/[0.1] text-white"
                : "text-theme-muted hover:text-theme-secondary"
            }`}
          >
            Enabled ({projects.filter((p) => p.enabled).length})
          </button>
          <button
            onClick={() => setFilterMode("disabled")}
            className={`px-2.5 py-1 rounded font-medium transition ${
              filterMode === "disabled"
                ? "bg-white/[0.1] text-white"
                : "text-theme-muted hover:text-theme-secondary"
            }`}
          >
            Disabled ({projects.filter((p) => !p.enabled).length})
          </button>
        </div>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <div className="p-12 text-center bg-[#0d1320] border border-white/[0.06] rounded-xl space-y-3 shadow-sm">
          <FolderLock className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">
            {projects.length === 0
              ? t.projects.noProjects || "No authorized projects yet"
              : "No matching projects found"}
          </div>
          <p className="text-theme-muted text-xs max-w-md mx-auto">
            {projects.length === 0
              ? t.projects.noProjectsDesc || "Authorize a local workspace to get started."
              : "Try adjusting your search or status filter."}
          </p>
          {projects.length === 0 && (
            <button
              onClick={onOpenAuthorizeModal}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-xs transition shadow-sm"
            >
              {t.projects.authorizeBtn || "Authorize Directory"}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredProjects.map((project) => {
            const isDeleting = deleteConfirmId === project.id;
            const isLoading = loadingId === project.id;

            return (
              <div
                key={project.id}
                onClick={() => handleSelect(project.id)}
                className={`p-5 bg-[#0d1320] border rounded-xl space-y-3 transition-all duration-150 cursor-pointer group shadow-sm ${
                  project.enabled
                    ? "border-white/[0.06] hover:border-white/[0.14]"
                    : "border-white/[0.03] opacity-60"
                }`}
              >
                {/* Upper Row: Name, Path, and Actions */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-theme-primary text-base group-hover:text-sky-300 transition-colors truncate">
                        {project.name}
                      </span>
                      <span className="font-mono text-xs text-theme-muted">
                        {project.id}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          project.enabled
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {project.enabled ? "AUTHORIZED" : "DISABLED"}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-theme-secondary bg-[#080c14] px-2.5 py-1 rounded border border-white/[0.06] inline-block select-all">
                      {project.root}
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => handleToggleEnable(project, e)}
                      disabled={isLoading}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        project.enabled
                          ? "bg-white/[0.04] hover:bg-white/[0.08] text-theme-secondary border-white/[0.06]"
                          : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/30"
                      }`}
                    >
                      {project.enabled ? "Disable" : "Enable"}
                    </button>

                    {isDeleting ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleRemove(project.id, e)}
                          disabled={isLoading}
                          className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition shadow-sm"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          className="px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-theme-secondary rounded-lg text-xs border border-white/[0.08] transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(project.id);
                        }}
                        disabled={isLoading}
                        className="p-1.5 text-theme-muted hover:text-red-400 hover:bg-white/[0.06] rounded-lg transition"
                        title="Remove authorization"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-400 bg-sky-500/10 border border-sky-500/20 group-hover:bg-sky-500/20 transition">
                      <span>Detail</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* Lower Row: Security & Permission Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-white/[0.04] text-xs font-mono">
                  <div className="flex items-center justify-between p-2.5 bg-[#070b13] rounded-lg border border-white/[0.04]">
                    <div>
                      <div className="font-medium text-theme-secondary flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-theme-muted" />
                        <span>Access Mode</span>
                      </div>
                      <div className="text-theme-muted text-[11px] mt-0.5">
                        {project.accessMode === "read-only"
                          ? "Files are protected against edits"
                          : "Full file modification authorized"}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleToggleAccess(project, e)}
                      disabled={isLoading}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                        project.accessMode === "read-only"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {project.accessMode === "read-only" ? "Read-Only" : "Read-Write"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-[#070b13] rounded-lg border border-white/[0.04]">
                    <div>
                      <div className="font-medium text-theme-secondary flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-theme-muted" />
                        <span>Execution Boundary</span>
                      </div>
                      <div className="text-theme-muted text-[11px] mt-0.5">
                        Mode: {project.executionMode}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                      {project.executionMode}
                    </span>
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
