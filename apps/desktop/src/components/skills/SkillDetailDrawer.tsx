import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  Wrench,
  Workflow,
  Copy,
  Check,
  FolderOpen,
  RotateCw,
  Trash2,
  Tag,
  ArrowDown,
  FileText,
  Code2,
} from "lucide-react";
import type {
  SkillDefinition,
  SkillRawContentResult,
  UserExperienceMode,
} from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { bridge } from "../../api/bridge.js";

interface SkillDetailDrawerProps {
  skillId: string | null;
  projectId?: string;
  projectRoot?: string;
  onClose: () => void;
  onReload?: () => void;
  initialMode?: UserExperienceMode;
}

type TabType = "overview" | "workflow" | "tools" | "skillMd" | "rawConfig";

const WORKFLOW_STEP_TITLE_MAP: Record<string, { zh: string; en: string }> = {
  confirm_project: { zh: "确认项目", en: "Confirm Project" },
  reproduce_build_failure: { zh: "复现构建失败", en: "Reproduce Build Failure" },
  collect_error_diagnostics: { zh: "收集错误诊断", en: "Collect Error Diagnostics" },
  locate_root_cause: { zh: "定位代码根因", en: "Locate Root Cause" },
  formulate_patch_plan: { zh: "制定修复方案", en: "Formulate Patch Plan" },
  apply_code_patch: { zh: "应用代码修改", en: "Apply Code Patch" },
  verify_build_fix: { zh: "回归验证构建", en: "Verify Build Fix" },
  inspect_architecture: { zh: "探查项目架构", en: "Inspect Architecture" },
  map_project_structure: { zh: "梳理项目结构", en: "Map Project Structure" },
  analyze_dependencies: { zh: "分析依赖关系", en: "Analyze Dependencies" },
  identify_entrypoints: { zh: "识别核心入口", en: "Identify Core Entrypoints" },
  summarize_findings: { zh: "总结探查发现", en: "Summarize Findings" },
  run_test_suite: { zh: "运行测试套件", en: "Run Test Suite" },
  collect_test_failures: { zh: "收集测试失败", en: "Collect Test Failures" },
  diagnose_test_errors: { zh: "诊断测试错误", en: "Diagnose Test Errors" },
  fix_test_code: { zh: "修复测试代码", en: "Fix Test Code" },
  verify_tests_pass: { zh: "验证测试通过", en: "Verify Tests Pass" },
  review_changes: { zh: "审查代码变更", en: "Review Code Changes" },
  check_git_diff: { zh: "比对 Git 差异", en: "Check Git Diff" },
  audit_security_impact: { zh: "审计安全影响", en: "Audit Security Impact" },
};

function getToolScopeBadge(toolName: string): "READ" | "WRITE" | "EXECUTE" {
  if (
    toolName.includes("exec") ||
    toolName.includes("run") ||
    toolName.includes("start") ||
    toolName.includes("build") ||
    toolName.includes("test")
  ) {
    return "EXECUTE";
  }
  if (
    toolName.includes("write") ||
    toolName.includes("patch") ||
    toolName.includes("delete") ||
    toolName.includes("create") ||
    toolName.includes("apply") ||
    toolName.includes("set")
  ) {
    return "WRITE";
  }
  return "READ";
}

export const SkillDetailDrawer: React.FC<SkillDetailDrawerProps> = ({
  skillId,
  projectId,
  projectRoot,
  onClose,
  onReload,
  initialMode = "standard",
}) => {
  const { t, language } = useTranslation();

  const [skill, setSkill] = useState<SkillDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mode: standard vs advanced
  const [mode, setMode] = useState<UserExperienceMode>(initialMode);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // Raw Content
  const [rawContent, setRawContent] = useState<SkillRawContentResult | null>(null);
  const [loadingRaw, setLoadingRaw] = useState(false);

  // Copy states
  const [copiedId, setCopiedId] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedYaml, setCopiedYaml] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load skill definition
  useEffect(() => {
    if (!skillId) {
      setSkill(null);
      setRawContent(null);
      setActiveTab("overview");
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    bridge
      .getSkill(skillId, projectId)
      .then((data) => {
        if (active) {
          setSkill(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.message || "Failed to load skill details");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [skillId, projectId]);

  // Load raw content when rawConfig tab is active
  useEffect(() => {
    if (activeTab === "rawConfig" && skillId && !rawContent) {
      setLoadingRaw(true);
      bridge
        .getSkillRawContent(skillId, projectId)
        .then((res) => setRawContent(res))
        .catch(() => {})
        .finally(() => setLoadingRaw(false));
    }
  }, [activeTab, skillId, projectId, rawContent]);

  // Reset active tab if switching from advanced to standard
  useEffect(() => {
    if (mode === "standard" && (activeTab === "tools" || activeTab === "rawConfig")) {
      setActiveTab("overview");
    }
  }, [mode, activeTab]);

  if (!skillId) return null;

  const handleCopyId = () => {
    if (skill) {
      navigator.clipboard.writeText(skill.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleCopyMd = () => {
    if (skill?.instructions) {
      navigator.clipboard.writeText(skill.instructions);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    }
  };

  const handleCopyYaml = () => {
    if (rawContent?.rawYaml) {
      navigator.clipboard.writeText(rawContent.rawYaml);
      setCopiedYaml(true);
      setTimeout(() => setCopiedYaml(false), 2000);
    }
  };

  const handleToggle = async () => {
    if (!skill) return;
    try {
      const res = await bridge.toggleSkill(skill.id, !skill.enabled);
      if (res.success) {
        setSkill({ ...skill, enabled: !skill.enabled });
        onReload?.();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to toggle skill");
    }
  };

  const handleOpenFolder = async () => {
    if (skill?.sourcePath) {
      try {
        await bridge.openSkillSourceFolder(skill.sourcePath);
      } catch (err: any) {
        alert(err?.message || "Failed to open folder");
      }
    }
  };

  const handleDelete = async () => {
    if (!skill) return;
    setDeleting(true);
    try {
      const res = await bridge.deleteSkill(skill.id, skill.source as any, projectId, projectRoot);
      if (res.success) {
        onReload?.();
        onClose();
      } else {
        alert(res.error || "Failed to delete skill");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to delete skill");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
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

  const displayName = skill
    ? skill.name[language] || skill.name["zh-CN"] || skill.name["en-US"] || skill.id
    : "";

  const displayDesc = skill
    ? skill.description[language] ||
      skill.description["zh-CN"] ||
      skill.description["en-US"] ||
      ""
    : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
      <div
        className="w-full sm:w-[46vw] sm:min-w-[720px] sm:max-w-[900px] bg-theme-base border-l border-theme-subtle h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 px-6 py-4 border-b border-theme-subtle bg-theme-base/95 backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-500 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-theme-primary truncate">
                    {displayName}
                  </h2>
                  {skill && (
                    <span
                      className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border font-semibold ${getRiskBadge(
                        skill.risk
                      )}`}
                    >
                      {skill.risk} {t.skills?.riskLow?.split(" ")[1] || "Risk"}
                    </span>
                  )}
                  {skill?.source === "builtin" ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-medium">
                      {t.skills.sourceBuiltin}
                    </span>
                  ) : skill?.source === "project" ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-medium">
                      {t.skills.sourceProject}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-medium">
                      {t.skills.sourceUser}
                    </span>
                  )}
                  {skill && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-theme-card-muted border border-theme-subtle text-theme-muted">
                      v{skill.version}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1 text-xs text-theme-muted font-mono">
                  <span className="truncate">{skillId}</span>
                  <button
                    onClick={handleCopyId}
                    className="hover:text-theme-primary transition p-0.5 rounded hover:bg-theme-card-hover"
                    title="Copy ID"
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Controls: Mode Switch, Enable Toggle, Close */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Standard vs Advanced Mode Toggle */}
              <div className="flex items-center p-0.5 rounded-lg bg-theme-card border border-theme-subtle">
                <button
                  type="button"
                  onClick={() => setMode("standard")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                    mode === "standard"
                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold shadow-xs"
                      : "text-theme-muted hover:text-theme-primary"
                  }`}
                >
                  {t.skills.standardMode}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("advanced")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                    mode === "advanced"
                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold shadow-xs"
                      : "text-theme-muted hover:text-theme-primary"
                  }`}
                >
                  {t.skills.advancedMode}
                </button>
              </div>

              {/* Enabled Switch */}
              {skill && (
                <button
                  onClick={handleToggle}
                  disabled={skill.validationStatus === "invalid" || skill.validationStatus === "conflict"}
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
              )}

              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
                title={t.common.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 mt-4 pt-2 border-t border-theme-subtle">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "overview"
                  ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold"
                  : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover"
              }`}
            >
              {t.skills.tabOverview}
            </button>

            <button
              onClick={() => setActiveTab("workflow")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === "workflow"
                  ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold"
                  : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover"
              }`}
            >
              <span>{t.skills.tabWorkflow}</span>
              {skill && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-theme-card-muted text-theme-muted">
                  {skill.workflow.length}
                </span>
              )}
            </button>

            {mode === "advanced" && (
              <button
                onClick={() => setActiveTab("tools")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  activeTab === "tools"
                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold"
                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover"
                }`}
              >
                <span>{t.skills.tabTools}</span>
                {skill && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-theme-card-muted text-theme-muted">
                    {skill.tools.length}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab("skillMd")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "skillMd"
                  ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold"
                  : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover"
              }`}
            >
              {t.skills.tabSkillMd}
            </button>

            {mode === "advanced" && (
              <button
                onClick={() => setActiveTab("rawConfig")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === "rawConfig"
                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold"
                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover"
                }`}
              >
                {t.skills.tabRawConfig}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="py-20 text-center text-sm text-theme-muted">
              {t.common.loading}...
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {skill && !loading && (
            <>
              {/* Security Warning Alert */}
              {skill.securityWarning && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-xs uppercase tracking-wider mb-1">
                      {t.skills.securityWarningTitle}
                    </h4>
                    <p className="text-xs leading-relaxed">{skill.securityWarning}</p>
                  </div>
                </div>
              )}

              {/* Validation Errors Alert */}
              {skill.validationErrors && skill.validationErrors.length > 0 && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
                  <h4 className="font-semibold text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    {t.skills.validationErrorsTitle}
                  </h4>
                  <ul className="list-disc list-inside space-y-1">
                    {skill.validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Description */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted mb-2">
                      {language === "zh-CN" ? "技能概述" : "Description"}
                    </h3>
                    <p className="text-sm text-theme-primary leading-relaxed bg-theme-card p-4 rounded-xl border border-theme-subtle">
                      {displayDesc || "No description provided."}
                    </p>
                  </div>

                  {/* Metadata Grid */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted mb-2.5">
                      {language === "zh-CN" ? "配置属性" : "Attributes"}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-theme-card border border-theme-subtle">
                        <div className="text-[11px] text-theme-muted mb-1">
                          {language === "zh-CN" ? "来源" : "Source"}
                        </div>
                        <div className="text-xs font-semibold text-theme-primary">
                          {skill.source === "builtin"
                            ? t.skills.sourceBuiltin
                            : skill.source === "project"
                            ? t.skills.sourceProject
                            : t.skills.sourceUser}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-theme-card border border-theme-subtle">
                        <div className="text-[11px] text-theme-muted mb-1">
                          {language === "zh-CN" ? "版本" : "Version"}
                        </div>
                        <div className="text-xs font-semibold text-theme-primary font-mono">
                          v{skill.version}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-theme-card border border-theme-subtle">
                        <div className="text-[11px] text-theme-muted mb-1">
                          {language === "zh-CN" ? "分类" : "Category"}
                        </div>
                        <div className="text-xs font-semibold text-theme-primary">
                          {getCategoryLabel(skill.category)}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-theme-card border border-theme-subtle">
                        <div className="text-[11px] text-theme-muted mb-1">
                          {language === "zh-CN" ? "风险级别" : "Risk"}
                        </div>
                        <div className="text-xs font-semibold text-theme-primary uppercase">
                          {skill.risk}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-theme-card border border-theme-subtle">
                        <div className="text-[11px] text-theme-muted mb-1">
                          {language === "zh-CN" ? "状态" : "Status"}
                        </div>
                        <div className="text-xs font-semibold text-theme-primary flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              skill.enabled ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          <span>
                            {skill.enabled
                              ? language === "zh-CN"
                                ? "已启用"
                                : "Enabled"
                              : language === "zh-CN"
                              ? "已禁用"
                              : "Disabled"}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-theme-card border border-theme-subtle">
                        <div className="text-[11px] text-theme-muted mb-1">
                          {language === "zh-CN" ? "工作流步数" : "Workflow"}
                        </div>
                        <div className="text-xs font-semibold text-theme-primary font-mono">
                          {skill.workflow.length} {t.skills.workflowSteps}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Advanced Mode: Source Path */}
                  {mode === "advanced" && skill.sourcePath && (
                    <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle">
                      <div className="text-[11px] text-theme-muted mb-1">
                        {language === "zh-CN" ? "安装路径" : "Source Path"}
                      </div>
                      <div className="text-xs font-mono text-theme-secondary break-all">
                        {skill.sourcePath}
                      </div>
                    </div>
                  )}

                  {/* Triggers List */}
                  {skill.triggers && skill.triggers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2.5">
                        <Tag className="w-4 h-4 text-sky-500" />
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
                          {t.skills.triggers} ({skill.triggers.length})
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {skill.triggers.map((trigger, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 rounded-lg bg-theme-card border border-theme-subtle text-xs text-theme-secondary shadow-2xs"
                          >
                            {trigger}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: WORKFLOW TIMELINE */}
              {activeTab === "workflow" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted flex items-center gap-2">
                      <Workflow className="w-4 h-4 text-sky-500" />
                      <span>
                        {t.skills.workflowPipeline} ({skill.workflow.length}{" "}
                        {t.skills.workflowSteps})
                      </span>
                    </h3>
                  </div>

                  {/* Timeline container */}
                  <div className="relative pl-6 space-y-4 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-theme-subtle">
                    {skill.workflow.map((stepId, idx) => {
                      const mapping = WORKFLOW_STEP_TITLE_MAP[stepId];
                      const title = mapping
                        ? language === "zh-CN"
                          ? mapping.zh
                          : mapping.en
                        : stepId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

                      const isLast = idx === skill.workflow.length - 1;

                      return (
                        <div key={idx} className="relative group">
                          {/* Step Index Circle */}
                          <div className="absolute -left-6 top-1.5 w-6 h-6 rounded-full bg-theme-base border-2 border-sky-500 text-sky-500 flex items-center justify-center text-xs font-bold font-mono shadow-xs">
                            {idx + 1}
                          </div>

                          {/* Step Card */}
                          <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle hover:border-sky-500/40 transition shadow-xs">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h4 className="text-sm font-semibold text-theme-primary">
                                {title}
                              </h4>
                              <span className="text-[11px] font-mono text-theme-muted">
                                Step {idx + 1}
                              </span>
                            </div>
                            <div className="text-xs font-mono text-theme-muted">
                              {stepId}
                            </div>
                          </div>

                          {/* Arrow connector */}
                          {!isLast && (
                            <div className="flex justify-center -mb-2 py-1">
                              <ArrowDown className="w-3.5 h-3.5 text-sky-500/40" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: TOOLS (ADVANCED MODE) */}
              {activeTab === "tools" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-sky-500" />
                      <span>{t.skills.allowedTools}</span>
                    </h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium">
                      {skill.tools.length} {t.skills.toolsCount}
                    </span>
                  </div>

                  <div className="divide-y divide-theme-subtle rounded-xl border border-theme-subtle bg-theme-card overflow-hidden">
                    {skill.tools.map((toolName) => {
                      const scope = getToolScopeBadge(toolName);
                      const badgeClass =
                        scope === "READ"
                          ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                          : scope === "WRITE"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";

                      return (
                        <div
                          key={toolName}
                          className="p-3.5 flex items-center justify-between gap-3 hover:bg-theme-card-hover transition"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-mono font-medium text-theme-primary truncate">
                              {toolName}
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0 ${badgeClass}`}
                          >
                            {scope}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: SKILL.md READER */}
              {activeTab === "skillMd" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted flex items-center gap-2">
                      <FileText className="w-4 h-4 text-sky-500" />
                      <span>{t.skills.instructionsTitle}</span>
                    </h3>

                    <button
                      type="button"
                      onClick={handleCopyMd}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-card border border-theme-subtle hover:bg-theme-card-hover text-xs font-medium text-theme-secondary hover:text-theme-primary shadow-xs transition"
                    >
                      {copiedMd ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-500">
                            {language === "zh-CN" ? "已复制" : "Copied"}
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t.skills.copyMarkdown}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Markdown Reader Body */}
                  <div className="max-w-[760px] mx-auto p-6 rounded-2xl bg-theme-card border border-theme-subtle text-xs text-theme-primary leading-relaxed space-y-4 font-sans select-text shadow-sm overflow-x-auto">
                    {skill.instructions ? (
                      skill.instructions.split("\n\n").map((block, idx) => {
                        const trimmed = block.trim();
                        if (!trimmed) return null;

                        // Headings
                        if (trimmed.startsWith("### ")) {
                          return (
                            <h4
                              key={idx}
                              className="text-sm font-bold text-theme-primary mt-4 mb-2 pb-1 border-b border-theme-subtle"
                            >
                              {trimmed.slice(4)}
                            </h4>
                          );
                        }
                        if (trimmed.startsWith("## ")) {
                          return (
                            <h3
                              key={idx}
                              className="text-base font-bold text-theme-primary mt-6 mb-2 pb-1 border-b border-theme-subtle"
                            >
                              {trimmed.slice(3)}
                            </h3>
                          );
                        }
                        if (trimmed.startsWith("# ")) {
                          return (
                            <h2
                              key={idx}
                              className="text-lg font-bold text-theme-primary mt-2 mb-3 pb-2 border-b-2 border-theme-subtle"
                            >
                              {trimmed.slice(2)}
                            </h2>
                          );
                        }

                        // Code Block
                        if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
                          const lines = trimmed.split("\n");
                          const lang = lines[0]?.slice(3).trim();
                          const code = lines.slice(1, -1).join("\n");
                          return (
                            <div
                              key={idx}
                              className="rounded-xl bg-theme-card-muted/80 border border-theme-subtle p-3.5 font-mono text-[11px] overflow-x-auto my-3"
                            >
                              {lang && (
                                <div className="text-[10px] uppercase text-theme-muted mb-1.5 font-semibold">
                                  {lang}
                                </div>
                              )}
                              <pre className="whitespace-pre">{code}</pre>
                            </div>
                          );
                        }

                        // Blockquote
                        if (trimmed.startsWith("> ")) {
                          return (
                            <blockquote
                              key={idx}
                              className="pl-3.5 border-l-3 border-sky-500 text-theme-secondary italic my-2.5"
                            >
                              {trimmed.slice(2)}
                            </blockquote>
                          );
                        }

                        // Unordered List
                        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                          const items = trimmed.split("\n").filter((l) => l.trim());
                          return (
                            <ul key={idx} className="list-disc list-inside space-y-1 my-2">
                              {items.map((item, itemIdx) => (
                                <li key={itemIdx} className="leading-relaxed">
                                  {item.replace(/^[-*]\s+/, "")}
                                </li>
                              ))}
                            </ul>
                          );
                        }

                        // Ordered List
                        if (/^\d+\.\s+/.test(trimmed)) {
                          const items = trimmed.split("\n").filter((l) => l.trim());
                          return (
                            <ol key={idx} className="list-decimal list-inside space-y-1 my-2">
                              {items.map((item, itemIdx) => (
                                <li key={itemIdx} className="leading-relaxed">
                                  {item.replace(/^\d+\.\s+/, "")}
                                </li>
                              ))}
                            </ol>
                          );
                        }

                        // Standard Paragraph
                        return (
                          <p key={idx} className="leading-relaxed text-theme-secondary">
                            {trimmed}
                          </p>
                        );
                      })
                    ) : (
                      <p className="text-theme-muted italic">No instructions available.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: RAW CONFIG (ADVANCED MODE) */}
              {activeTab === "rawConfig" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-sky-500" />
                      <span>skill.yaml</span>
                    </h3>

                    <button
                      type="button"
                      onClick={handleCopyYaml}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-card border border-theme-subtle hover:bg-theme-card-hover text-xs font-medium text-theme-secondary hover:text-theme-primary shadow-xs transition"
                    >
                      {copiedYaml ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-500">
                            {language === "zh-CN" ? "已复制" : "Copied"}
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t.skills.copyYaml}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {loadingRaw ? (
                    <div className="py-12 text-center text-xs text-theme-muted">
                      {t.common.loading}...
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-theme-card-muted/80 border border-theme-subtle p-4 font-mono text-xs text-theme-primary leading-relaxed whitespace-pre overflow-x-auto select-text shadow-sm">
                      {rawContent?.rawYaml || "skill.yaml content not available"}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Drawer Footer: User / Project Actions */}
        {skill && (
          <div className="sticky bottom-0 z-20 px-6 py-4 border-t border-theme-subtle bg-theme-base/95 backdrop-blur-md flex items-center justify-between gap-3">
            {/* Source Tag or Read-only info */}
            <div>
              {skill.source === "builtin" ? (
                <span className="text-xs text-theme-muted flex items-center gap-1.5 font-medium">
                  <ShieldAlert className="w-4 h-4 text-sky-500" />
                  <span>
                    {language === "zh-CN" ? "官方内置 · 只读规范" : "Built-in · Read-only"}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-theme-muted">
                  {skill.source === "user" ? t.skills.sourceUser : t.skills.sourceProject}
                </span>
              )}
            </div>

            {/* Actions for User or Project skills */}
            {skill.source !== "builtin" && (
              <div className="flex items-center gap-2.5">
                {skill.sourcePath && (
                  <button
                    type="button"
                    onClick={handleOpenFolder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-card border border-theme-subtle hover:bg-theme-card-hover text-xs font-medium text-theme-secondary hover:text-theme-primary shadow-xs transition"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-sky-500" />
                    <span>{t.skills.openFolder}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onReload?.()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-card border border-theme-subtle hover:bg-theme-card-hover text-xs font-medium text-theme-secondary hover:text-theme-primary shadow-xs transition"
                >
                  <RotateCw className="w-3.5 h-3.5 text-sky-500" />
                  <span>{t.skills.reloadButton}</span>
                </button>

                {showDeleteConfirm ? (
                  <div className="flex items-center gap-2 bg-red-500/10 p-1 rounded-lg border border-red-500/20">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-2 py-1 text-xs text-theme-muted hover:text-theme-primary"
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{language === "zh-CN" ? "确认删除" : "Confirm Delete"}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-xs font-medium text-red-600 dark:text-red-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t.skills.deleteButton}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
