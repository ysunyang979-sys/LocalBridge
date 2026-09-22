import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sparkles,
  Search,
  RotateCw,
  ShieldAlert,
  AlertTriangle,
  Workflow,
  Wrench,
  ChevronRight,
  Upload,
  CheckCircle2,
  X,
} from "lucide-react";
import type {
  SkillMetadata,
  SkillSource,
  UserExperienceMode,
} from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { bridge } from "../api/bridge.js";
import { SkillDetailDrawer } from "../components/skills/SkillDetailDrawer.js";
import { ImportSkillModal } from "../components/skills/ImportSkillModal.js";

interface SkillsPageProps {
  uxMode: UserExperienceMode;
  projectId?: string;
  projectRoot?: string;
}

export const SkillsPage: React.FC<SkillsPageProps> = ({
  uxMode,
  projectId,
  projectRoot,
}) => {
  const { t, language } = useTranslation();
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | SkillSource>("all");

  // Modals & Drawer State
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    description?: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (title: string, description?: string, type: "success" | "error" = "success") => {
    setToastMessage({ title, description, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bridge.listSkills({ projectId });
      setSkills(res.skills || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleReload = async () => {
    setReloading(true);
    try {
      const res = await bridge.reloadSkills();
      setSkills(res.skills || []);
      showToast(t.skills.reloadSuccess);
    } catch (err: any) {
      setError(err?.message || t.skills.reloadError);
      showToast(t.skills.reloadError, err?.message, "error");
    } finally {
      setReloading(false);
    }
  };

  const handleToggle = async (skill: SkillMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await bridge.toggleSkill(skill.id, !skill.enabled);
      if (res.success) {
        setSkills((prev) =>
          prev.map((s) => (s.id === skill.id ? { ...s, enabled: !skill.enabled } : s))
        );
      }
    } catch (err: any) {
      alert(err?.message || "Failed to toggle skill");
    }
  };

  const handleImportSuccess = (imported: SkillMetadata) => {
    const name =
      imported.name[language] ||
      imported.name["zh-CN"] ||
      imported.name["en-US"] ||
      imported.id;
    showToast(t.skills.importSuccess, `${name} (${imported.id})`);
    loadSkills();
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "low":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "medium":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "high":
        return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "inspection":
        return t.skills.categoryInspection;
      case "debugging":
        return t.skills.categoryDebugging;
      case "testing":
        return t.skills.categoryTesting;
      case "refactoring":
        return t.skills.categoryRefactoring;
      case "review":
        return t.skills.categoryReview;
      case "runtime":
        return t.skills.categoryRuntime;
      case "maintenance":
        return t.skills.categoryMaintenance;
      default:
        return t.skills.categoryGeneral;
    }
  };

  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      // Source filter
      if (sourceFilter !== "all" && skill.source !== sourceFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameZh = (skill.name["zh-CN"] || "").toLowerCase();
        const nameEn = (skill.name["en-US"] || "").toLowerCase();
        const descZh = (skill.description["zh-CN"] || "").toLowerCase();
        const descEn = (skill.description["en-US"] || "").toLowerCase();
        const idMatch = skill.id.toLowerCase().includes(q);
        const triggerMatch = skill.triggers.some((t) => t.toLowerCase().includes(q));
        const toolMatch = skill.tools.some((tl) => tl.toLowerCase().includes(q));

        return (
          idMatch ||
          nameZh.includes(q) ||
          nameEn.includes(q) ||
          descZh.includes(q) ||
          descEn.includes(q) ||
          triggerMatch ||
          toolMatch
        );
      }
      return true;
    });
  }, [skills, sourceFilter, searchQuery]);

  // Check if active source filter is empty specifically
  const isUserFilterEmpty = sourceFilter === "user" && filteredSkills.length === 0;
  const isProjectFilterEmpty = sourceFilter === "project" && filteredSkills.length === 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 p-4 rounded-xl shadow-xl bg-theme-base border border-theme-subtle animate-in slide-in-from-bottom-4 duration-200 max-w-sm">
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-theme-primary">
              {toastMessage.title}
            </div>
            {toastMessage.description && (
              <div className="text-[11px] text-theme-muted mt-0.5 break-words">
                {toastMessage.description}
              </div>
            )}
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 rounded text-theme-muted hover:text-theme-primary transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Action Row */}
      <div className="flex flex-col gap-4 pb-2 border-b border-theme-subtle">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-theme-primary flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-sky-500" />
              <span>{t.skills.title}</span>
            </h1>
            <p className="text-xs text-theme-muted mt-1">
              {t.skills.subtitle}
            </p>
          </div>

          {/* Primary & Secondary Action Buttons */}
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-500 text-white hover:bg-sky-600 text-xs font-semibold shadow-xs transition active:scale-95"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t.skills.importButton}</span>
            </button>

            <button
              onClick={handleReload}
              disabled={reloading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-theme-card border border-theme-subtle hover:bg-theme-card-hover text-xs font-medium text-theme-secondary hover:text-theme-primary transition disabled:opacity-50"
              title={t.skills.reloadButton}
            >
              <RotateCw
                className={`w-3.5 h-3.5 ${reloading ? "animate-spin text-sky-500" : ""}`}
              />
              <span>{reloading ? t.skills.reloading : t.skills.reloadButton}</span>
            </button>
          </div>
        </div>

        {/* Search & Source Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.skills.searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-theme-card border border-theme-subtle text-xs text-theme-primary placeholder-theme-muted focus:outline-none focus:border-sky-500 transition shadow-2xs"
            />
          </div>

          {/* Clean Source Filter Tabs (All / Builtin / User / Project) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-theme-card border border-theme-subtle shadow-2xs">
            {(
              [
                { id: "all", label: t.skills.filterAll },
                { id: "builtin", label: t.skills.filterBuiltin },
                { id: "user", label: t.skills.filterUser },
                { id: "project", label: t.skills.filterProject },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSourceFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  sourceFilter === tab.id
                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold shadow-xs"
                    : "text-theme-secondary hover:text-theme-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="py-24 text-center text-sm text-theme-muted">
          {t.common.loading}...
        </div>
      )}

      {/* Empty States */}
      {!loading && filteredSkills.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-theme-card/40 border border-theme-subtle border-dashed">
          <div className="p-3.5 rounded-full bg-sky-500/10 text-sky-500 mb-3">
            <Sparkles className="w-8 h-8" />
          </div>

          {isUserFilterEmpty ? (
            <>
              <h3 className="text-sm font-semibold text-theme-primary mb-1.5">
                {t.skills.emptyUserSkills}
              </h3>
              <p className="text-xs text-theme-muted max-w-sm mb-5 leading-relaxed">
                {t.skills.emptyUserSkillsDesc}
              </p>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white hover:bg-sky-600 text-xs font-semibold shadow-xs transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t.skills.importButton}</span>
              </button>
            </>
          ) : isProjectFilterEmpty ? (
            <>
              <h3 className="text-sm font-semibold text-theme-primary mb-1.5">
                {t.skills.emptyProjectSkills}
              </h3>
              <p className="text-xs text-theme-muted max-w-sm mb-5 leading-relaxed">
                {t.skills.emptyProjectSkillsDesc}
              </p>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white hover:bg-sky-600 text-xs font-semibold shadow-xs transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t.skills.importButton}</span>
              </button>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-theme-primary mb-1">
                {t.skills.emptySkills}
              </h3>
              <p className="text-xs text-theme-muted max-w-sm">
                {t.skills.emptySkillsDesc}
              </p>
            </>
          )}
        </div>
      )}

      {/* Skills Cards Grid */}
      {!loading && filteredSkills.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredSkills.map((skill) => {
            const displayName =
              skill.name[language] ||
              skill.name["zh-CN"] ||
              skill.name["en-US"] ||
              skill.id;

            const displayDesc =
              skill.description[language] ||
              skill.description["zh-CN"] ||
              skill.description["en-US"] ||
              "";

            const isBuiltin = skill.source === "builtin";
            const isConflict = skill.validationStatus === "conflict";
            const isInvalid = skill.validationStatus === "invalid";
            const hasWarning = Boolean(skill.securityWarning);

            return (
              <div
                key={skill.id}
                onClick={() => setSelectedSkillId(skill.id)}
                className={`group p-4 rounded-xl bg-theme-card border transition-all cursor-pointer flex flex-col justify-between hover:shadow-md ${
                  !skill.enabled
                    ? "opacity-60 border-theme-subtle bg-theme-card-muted/30"
                    : isConflict || isInvalid
                    ? "border-red-500/30 hover:border-red-500/50"
                    : hasWarning
                    ? "border-amber-500/30 hover:border-amber-500/50"
                    : "border-theme-subtle hover:border-sky-500/30"
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-500 shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-theme-primary truncate group-hover:text-sky-500 transition">
                          {displayName}
                        </h3>
                        {uxMode === "advanced" && (
                          <div className="text-[10px] font-mono text-theme-muted truncate">
                            {skill.id}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Enable Toggle Switch */}
                    <button
                      onClick={(e) => handleToggle(skill, e)}
                      disabled={isConflict || isInvalid}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed ${
                        skill.enabled ? "bg-sky-500" : "bg-slate-400 dark:bg-slate-700"
                      }`}
                      title={skill.enabled ? t.common.disable : t.common.enable}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          skill.enabled ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Clean Badges strip */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                    <span
                      className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border font-semibold ${getRiskBadge(
                        skill.risk
                      )}`}
                    >
                      {skill.risk} {t.skills.riskLow.split(" ")[1] || "Risk"}
                    </span>

                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-theme-card-muted border border-theme-subtle text-theme-secondary">
                      {getCategoryLabel(skill.category)}
                    </span>

                    {isBuiltin ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-medium">
                        {t.skills.sourceBuiltin}
                      </span>
                    ) : skill.source === "project" ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-medium">
                        {t.skills.sourceProject}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-medium">
                        {t.skills.sourceUser}
                      </span>
                    )}

                    {isConflict && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">
                        {t.skills.statusConflict}
                      </span>
                    )}

                    {hasWarning && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        {t.skills.statusWarning}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-theme-secondary line-clamp-2 leading-relaxed mb-3">
                    {displayDesc}
                  </p>

                  {/* Triggers preview */}
                  {skill.triggers.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {skill.triggers.slice(0, 3).map((trigger, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2 py-0.5 rounded bg-theme-card-muted text-theme-muted border border-theme-subtle truncate max-w-[140px]"
                        >
                          {trigger}
                        </span>
                      ))}
                      {skill.triggers.length > 3 && (
                        <span className="text-[10px] text-theme-muted font-mono">
                          +{skill.triggers.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="pt-3 border-t border-theme-subtle flex items-center justify-between text-xs text-theme-muted">
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="flex items-center gap-1">
                      <Workflow className="w-3 h-3 text-sky-500" />
                      {skill.workflow.length} {t.skills.workflowSteps}
                    </span>
                    <span className="flex items-center gap-1">
                      <Wrench className="w-3 h-3 text-sky-500" />
                      {skill.tools.length} {t.skills.toolsCount}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-sky-500 group-hover:translate-x-0.5 transition-transform text-[11px] font-medium">
                    <span>{t.skills.viewDetails}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Drawer */}
      <SkillDetailDrawer
        skillId={selectedSkillId}
        projectId={projectId}
        projectRoot={projectRoot}
        onClose={() => setSelectedSkillId(null)}
        onReload={loadSkills}
        initialMode={uxMode}
      />

      {/* Import Skill Modal */}
      <ImportSkillModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
        projectId={projectId}
        projectRoot={projectRoot}
      />
    </div>
  );
};
