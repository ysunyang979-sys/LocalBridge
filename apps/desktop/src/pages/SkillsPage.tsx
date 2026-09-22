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
  FileText,
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
  const [highlightedSkillId, setHighlightedSkillId] = useState<string | null>(null);
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
    setSourceFilter("user");
    setHighlightedSkillId(imported.id);
    loadSkills();
    setTimeout(() => {
      setHighlightedSkillId(null);
    }, 4000);
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "low":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60";
      case "medium":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60";
      case "high":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
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
      if (sourceFilter !== "all" && skill.source !== sourceFilter) {
        return false;
      }
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

  const isUserFilterEmpty = sourceFilter === "user" && filteredSkills.length === 0;
  const isProjectFilterEmpty = sourceFilter === "project" && filteredSkills.length === 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 p-4 rounded-xl shadow-2xl bg-white dark:bg-[#0d1320] border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-4 duration-200 max-w-sm">
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {toastMessage.title}
            </div>
            {toastMessage.description && (
              <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 break-words">
                {toastMessage.description}
              </div>
            )}
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Action Row */}
      <div className="flex flex-col gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <span>{t.skills.title}</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t.skills.subtitle}
            </p>
          </div>

          {/* Primary & Secondary Action Buttons */}
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs transition active:scale-95"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t.skills.importButton}</span>
            </button>

            <button
              onClick={handleReload}
              disabled={reloading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition shadow-2xs disabled:opacity-50"
              title={t.skills.reloadButton}
            >
              <RotateCw
                className={`w-3.5 h-3.5 ${reloading ? "animate-spin text-sky-600 dark:text-sky-400" : "text-slate-500 dark:text-slate-400"}`}
              />
              <span>{reloading ? t.skills.reloading : t.skills.reloadButton}</span>
            </button>
          </div>
        </div>

        {/* Search & Source Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.skills.searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 transition shadow-2xs"
            />
          </div>

          {/* Clean Source Filter Tabs (All / Builtin / User / Project) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
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
                    ? "bg-white dark:bg-[#121a2c] text-sky-600 dark:text-sky-400 font-semibold shadow-xs border border-slate-200/60 dark:border-slate-700"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
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
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="py-24 text-center text-sm text-slate-500 dark:text-slate-400">
          {t.common.loading}...
        </div>
      )}

      {/* Empty States */}
      {!loading && filteredSkills.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-white/60 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 border-dashed shadow-2xs">
          <div className="p-3.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 mb-3 shadow-2xs">
            <Sparkles className="w-8 h-8" />
          </div>

          {isUserFilterEmpty ? (
            <>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1.5">
                {t.skills.emptyUserSkills}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-5 leading-relaxed">
                {t.skills.emptyUserSkillsDesc}
              </p>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t.skills.importButton}</span>
              </button>
            </>
          ) : isProjectFilterEmpty ? (
            <>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1.5">
                {t.skills.emptyProjectSkills}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-5 leading-relaxed">
                {t.skills.emptyProjectSkillsDesc}
              </p>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t.skills.importButton}</span>
              </button>
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                {t.skills.emptySkills}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
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
                className={`group p-4 rounded-xl bg-white dark:bg-[#0d1320] border transition-all cursor-pointer flex flex-col justify-between hover:shadow-md ${
                  skill.id === highlightedSkillId
                    ? "ring-2 ring-sky-500 border-sky-500 bg-sky-50/30 dark:bg-sky-950/30 shadow-lg scale-[1.01]"
                    : !skill.enabled
                    ? "opacity-60 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40"
                    : isConflict || isInvalid
                    ? "border-rose-300 dark:border-rose-800/60 hover:border-rose-500"
                    : hasWarning
                    ? "border-amber-300 dark:border-amber-800/60 hover:border-amber-500"
                    : "border-slate-200 dark:border-slate-800 hover:border-sky-500/50"
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/60 text-sky-600 dark:text-sky-400 shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition">
                          {displayName}
                        </h3>
                        {uxMode === "advanced" && (
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
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
                        skill.enabled ? "bg-sky-600 dark:bg-sky-500" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                      title={skill.enabled ? t.common.disable : t.common.enable}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          skill.enabled ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Clean Badges Strip */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                    <span
                      className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border font-semibold ${getRiskBadge(
                        skill.risk
                      )}`}
                    >
                      {skill.risk} {t.skills.riskLow.split(" ")[1] || "Risk"}
                    </span>

                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                      {getCategoryLabel(skill.category)}
                    </span>

                    {isBuiltin ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60 font-semibold">
                        {t.skills.sourceBuiltin}
                      </span>
                    ) : skill.source === "project" ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/60 font-semibold">
                        {t.skills.sourceProject}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/60 font-semibold">
                        {t.skills.sourceUser}
                      </span>
                    )}

                    {skill.type === "raw" && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-400 dark:border-fuchsia-800/60 font-semibold">
                        RAW
                      </span>
                    )}

                    {isConflict && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60 font-semibold">
                        {t.skills.statusConflict}
                      </span>
                    )}

                    {hasWarning && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60 font-semibold flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        {t.skills.statusWarning}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed mb-3">
                    {displayDesc}
                  </p>

                  {/* Triggers Preview */}
                  {skill.triggers.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {skill.triggers.slice(0, 3).map((trigger, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2 py-0.5 rounded bg-slate-100/70 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[140px]"
                        >
                          {trigger}
                        </span>
                      ))}
                      {skill.triggers.length > 3 && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          +{skill.triggers.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  {skill.type === "raw" ? (
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="flex items-center gap-1 text-fuchsia-600 dark:text-fuchsia-400 font-medium">
                        <FileText className="w-3.5 h-3.5" />
                        <span>{skill.primaryDocument || "SKILL.md"}</span>
                      </span>
                      {skill.documents && skill.documents.length > 1 && (
                        <span className="text-slate-400">
                          {skill.documents.length} 篇文档
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="flex items-center gap-1">
                        <Workflow className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span>
                          {skill.workflow.length} {t.skills.workflowSteps}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Wrench className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span>
                          {skill.tools.length} {t.skills.toolsCount}
                        </span>
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-sky-600 dark:text-sky-400 group-hover:translate-x-0.5 transition-transform text-[11px] font-semibold">
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
