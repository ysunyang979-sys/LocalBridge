import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  X,
  Layers,
  Search,
  ChevronRight,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { SkillMetadata } from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";

export interface CollectionDetailDrawerProps {
  collectionId: string | null;
  collectionName?: string;
  skills: SkillMetadata[];
  projectId?: string;
  projectRoot?: string;
  isChildDrawerOpen?: boolean;
  onClose: () => void;
  onToggleSkill: (skill: SkillMetadata, enabled: boolean) => Promise<void>;
  onToggleAll: (enabled: boolean) => Promise<void>;
  onSelectSkill?: (skillId: string) => void;
  onDeleteCollection?: (collectionId: string, skills: SkillMetadata[]) => Promise<void>;
  onDeleteSkill?: (skill: SkillMetadata) => Promise<void>;
}

export const CollectionDetailDrawer: React.FC<CollectionDetailDrawerProps> = ({
  collectionId,
  collectionName,
  skills,
  projectId: _projectId,
  projectRoot: _projectRoot,
  isChildDrawerOpen = false,
  onClose,
  onToggleSkill,
  onToggleAll,
  onSelectSkill,
  onDeleteCollection,
  onDeleteSkill,
}) => {
  const { language } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [togglingAll, setTogglingAll] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Delete modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingCollection, setDeletingCollection] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<SkillMetadata | null>(null);
  const [deletingSkill, setDeletingSkill] = useState(false);

  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  // Extract all child skills belonging to this collection
  const childSkills = useMemo(() => {
    if (!collectionId) return [];
    return skills.filter((s) => s.collectionId === collectionId);
  }, [skills, collectionId]);

  const totalCount = childSkills.length;
  const enabledCount = childSkills.filter((s) => s.enabled).length;
  const disabledCount = totalCount - enabledCount;

  const isAllEnabled = totalCount > 0 && enabledCount === totalCount;
  const isAllDisabled = totalCount > 0 && enabledCount === 0;
  const isMixed = totalCount > 0 && !isAllEnabled && !isAllDisabled;

  // Sync indeterminate state to the master checkbox DOM element
  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = isMixed;
    }
  }, [isMixed]);

  // Filtered child skills by search and status
  const filteredChildSkills = useMemo(() => {
    return childSkills.filter((skill) => {
      if (statusFilter === "enabled" && !skill.enabled) return false;
      if (statusFilter === "disabled" && skill.enabled) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = skill.id.toLowerCase().includes(q);
        const nameZh = (skill.name["zh-CN"] || "").toLowerCase();
        const nameEn = (skill.name["en-US"] || "").toLowerCase();
        const descZh = (skill.description["zh-CN"] || "").toLowerCase();
        const descEn = (skill.description["en-US"] || "").toLowerCase();
        const triggerMatch = (skill.triggers || []).some((t) => t.toLowerCase().includes(q));

        return (
          idMatch ||
          nameZh.includes(q) ||
          nameEn.includes(q) ||
          descZh.includes(q) ||
          descEn.includes(q) ||
          triggerMatch
        );
      }
      return true;
    });
  }, [childSkills, statusFilter, searchQuery]);

  if (!collectionId) return null;

  const resolvedCollectionName =
    collectionName ||
    childSkills[0]?.collectionName ||
    collectionId.replace(/^collection\./, "");

  const handleMasterToggle = async () => {
    setTogglingAll(true);
    try {
      // If currently all enabled -> turn all OFF. Otherwise -> turn all ON.
      const targetState = !isAllEnabled;
      await onToggleAll(targetState);
    } finally {
      setTogglingAll(false);
    }
  };

  const handleSingleToggle = async (skill: SkillMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingIds((prev) => new Set(prev).add(skill.id));
    try {
      await onToggleSkill(skill, !skill.enabled);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
    }
  };

  const handleConfirmDeleteCollection = async () => {
    if (!onDeleteCollection) return;
    setDeletingCollection(true);
    try {
      await onDeleteCollection(collectionId, childSkills);
      setShowDeleteModal(false);
      onClose();
    } finally {
      setDeletingCollection(false);
    }
  };

  const handleConfirmDeleteSkill = async () => {
    if (!skillToDelete || !onDeleteSkill) return;
    setDeletingSkill(true);
    try {
      await onDeleteSkill(skillToDelete);
      setSkillToDelete(null);
    } finally {
      setDeletingSkill(false);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity duration-200 ${
          isChildDrawerOpen ? "hidden" : ""
        }`}
        onClick={onClose}
      >
        <div
          className="w-full sm:w-[46vw] sm:min-w-[720px] sm:max-w-[920px] h-full bg-white dark:bg-[#0d1320] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col min-w-0 animate-in slide-in-from-right duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Header */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/60 text-purple-600 dark:text-purple-400 shrink-0 shadow-2xs">
                <Layers className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    {resolvedCollectionName}
                  </h2>
                  <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                    Skill 集合
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono truncate">
                  {collectionId} · 共 {totalCount} 个子技能
                </p>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2.5 shrink-0">
              {onDeleteCollection && (
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition shadow-2xs"
                  title="删除整个集合及其所有子技能"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除集合</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Master Switch & Bulk Action Bar */}
          <div className="p-4 px-6 bg-gradient-to-r from-purple-50/70 via-indigo-50/50 to-sky-50/70 dark:from-purple-950/20 dark:via-indigo-950/15 dark:to-sky-950/20 border-b border-purple-100 dark:border-purple-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            {/* Master Checkbox & Label */}
            <div
              className="flex items-center gap-3 cursor-pointer select-none"
              onClick={handleMasterToggle}
            >
              <div className="relative flex items-center justify-center">
                <input
                  ref={masterCheckboxRef}
                  type="checkbox"
                  checked={isAllEnabled}
                  disabled={togglingAll}
                  onChange={handleMasterToggle}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>集合主开关</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                      isAllEnabled
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : isAllDisabled
                        ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                    }`}
                  >
                    {isAllEnabled
                      ? "全部已启用"
                      : isAllDisabled
                      ? "已全部关闭"
                      : `部分启用 (${enabledCount}/${totalCount})`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  ChatGPT 仅能调度已启用的子技能 ({enabledCount} / {totalCount})
                </p>
              </div>
            </div>

            {/* Quick Bulk Buttons */}
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                disabled={togglingAll || isAllEnabled}
                onClick={() => onToggleAll(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-purple-700 dark:text-purple-300 shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                全部启用
              </button>
              <button
                type="button"
                disabled={togglingAll || isAllDisabled}
                onClick={() => onToggleAll(false)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                全部关闭
              </button>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="p-4 px-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索子技能名称、ID 或关键词..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-purple-500 shadow-2xs"
              />
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs self-start sm:self-auto">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  statusFilter === "all"
                    ? "bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 font-semibold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                全部 ({totalCount})
              </button>
              <button
                onClick={() => setStatusFilter("enabled")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  statusFilter === "enabled"
                    ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                已启用 ({enabledCount})
              </button>
              <button
                onClick={() => setStatusFilter("disabled")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  statusFilter === "disabled"
                    ? "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                已关闭 ({disabledCount})
              </button>
            </div>
          </div>

          {/* Scrollable Child Skills List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
            {filteredChildSkills.map((skill) => {
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
              const isToggling = togglingIds.has(skill.id);

              return (
                <div
                  key={skill.id}
                  onClick={() => onSelectSkill?.(skill.id)}
                  className={`group p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    skill.enabled
                      ? "bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-800/80 shadow-2xs hover:shadow-xs"
                      : "bg-slate-50/60 dark:bg-slate-900/30 border-slate-200/60 dark:border-slate-800/40 opacity-70"
                  }`}
                >
                  {/* Header row: Name, doc badges, individual toggle switch */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition truncate">
                          {displayName}
                        </h4>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          SKILL.md
                        </span>
                        {skill.type !== "raw" && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                            skill.yaml
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                        {skill.id}
                      </div>
                    </div>

                    {/* Individual Toggle Switch */}
                    <div
                      className="flex items-center gap-2 shrink-0 pt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={skill.enabled}
                          disabled={isToggling}
                          onChange={(e) => handleSingleToggle(skill, e as any)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4.5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                  </div>

                  {/* Description */}
                  {displayDesc && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {displayDesc}
                    </p>
                  )}

                  {/* Footer meta row */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-400 dark:text-slate-500">
                    <div className="flex items-center gap-3">
                      {skill.triggers && skill.triggers.length > 0 && (
                        <span className="truncate max-w-[280px]">
                          关键词: {skill.triggers.slice(0, 3).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {onDeleteSkill && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSkillToDelete(skill);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition"
                          title="删除该子技能"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium group-hover:translate-x-0.5 transition-transform">
                        <span>查看详情</span>
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredChildSkills.length === 0 && (
              <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                <Search className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                <span>没有找到匹配的子技能</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Collection Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => !deletingCollection && setShowDeleteModal(false)}
        >
          <div
            className="bg-white dark:bg-[#0f172a] border border-rose-200 dark:border-rose-900/60 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  删除技能集合
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                  确定要删除集合「<span className="font-semibold text-slate-900 dark:text-slate-100">{resolvedCollectionName}</span>」吗？
                </p>
                <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-800/40 text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                  此操作将永久删除该集合下的全部 <strong>{totalCount}</strong> 个子技能目录及配置。此操作无法撤销。
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={deletingCollection}
                onClick={() => setShowDeleteModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deletingCollection}
                onClick={handleConfirmDeleteCollection}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {deletingCollection ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在删除全部技能...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>确认删除全部 ({totalCount})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Child Skill Confirmation Modal */}
      {skillToDelete && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => !deletingSkill && setSkillToDelete(null)}
        >
          <div
            className="bg-white dark:bg-[#0f172a] border border-rose-200 dark:border-rose-900/60 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              删除子技能
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              确定要从集合中删除「
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {skillToDelete.name[language] || skillToDelete.name["zh-CN"] || skillToDelete.id}
              </span>
              」吗？文件将被永久移除。
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                disabled={deletingSkill}
                onClick={() => setSkillToDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deletingSkill}
                onClick={handleConfirmDeleteSkill}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition flex items-center gap-1.5 shadow-sm"
              >
                {deletingSkill ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>确认删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
