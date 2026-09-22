import React, { useState, useRef } from "react";
import {
  X,
  Upload,
  FolderOpen,
  Archive,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Wrench,
  Workflow,
  Info,
  Loader2,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Settings,
  ShieldAlert,
} from "lucide-react";
import type {
  SkillImportPreview,
  SkillMetadata,
  SkillCategory,
  SkillRisk,
} from "../../types.js";
import {
  validateSkillManifestRoundTrip,
  type SkillYamlInput,
} from "@localbridge/protocol";
import { useTranslation } from "../../i18n/useTranslation.js";
import { bridge } from "../../api/bridge.js";

interface ImportSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (skill: SkillMetadata) => void;
  projectId?: string;
  projectRoot?: string;
}

const DEFAULT_MCP_TOOLS = [
  "localbridge_file_read",
  "localbridge_file_write",
  "localbridge_code_diagnostics",
  "localbridge_project_list",
  "localbridge_ast_grep_search",
  "localbridge_job_start",
];

interface StructuredImportError {
  stage?: string;
  code?: string;
  message: string;
  details?: any;
}

function formatStageName(stage?: string, lang: string = "zh-CN"): string {
  if (!stage) return "";
  const map: Record<string, { zh: string; en: string }> = {
    resolve_subpath: { zh: "候选路径解析 (resolve_subpath)", en: "Candidate Path Resolution (resolve_subpath)" },
    staging_init: { zh: "临时工作区初始化 (staging_init)", en: "Staging Initialization (staging_init)" },
    declarative_sanitization: { zh: "可执行资源净化 (declarative_sanitization)", en: "Declarative Sanitization (declarative_sanitization)" },
    manifest_injection: { zh: "配置向导清单注入 (manifest_injection)", en: "Manifest Injection (manifest_injection)" },
    staging_validation: { zh: "声明式配置校验 (staging_validation)", en: "Staging Validation (staging_validation)" },
    conflict_check: { zh: "命名空间与版本冲突检查 (conflict_check)", en: "Conflict Check (conflict_check)" },
    filesystem_commit: { zh: "文件系统写入 (filesystem_commit)", en: "Filesystem Commit (filesystem_commit)" },
    registry_reload: { zh: "技能注册表重载 (registry_reload)", en: "Registry Reload (registry_reload)" },
  };
  const item = map[stage];
  if (!item) return stage;
  return lang === "zh-CN" ? item.zh : item.en;
}

export const ImportSkillModal: React.FC<ImportSkillModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  projectRoot,
}) => {
  const { t, language } = useTranslation();

  const [isDragging, setIsDragging] = useState(false);
  const [selectedSourceType, setSelectedSourceType] = useState<"folder" | "zip" | null>(null);
  const [sourcePath, setSourcePath] = useState<string>("");
  const [zipBase64, setZipBase64] = useState<string>("");
  const [selectedTarget, setSelectedTarget] = useState<"user" | "project">("user");
  const [selectedSubPath, setSelectedSubPath] = useState<string>("");

  const [preview, setPreview] = useState<SkillImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importErrorData, setImportErrorData] = useState<StructuredImportError | null>(null);

  // Excluded files collapsible state
  const [showExcludedFiles, setShowExcludedFiles] = useState(false);

  // Config wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardNameZh, setWizardNameZh] = useState("");
  const [wizardNameEn, setWizardNameEn] = useState("");
  const [wizardId, setWizardId] = useState("");
  const [wizardDescZh, setWizardDescZh] = useState("");
  const [wizardDescEn, setWizardDescEn] = useState("");
  const [wizardCategory, setWizardCategory] = useState<SkillCategory>("general");
  const [wizardRisk, setWizardRisk] = useState<SkillRisk>("medium");
  const [wizardTriggers, setWizardTriggers] = useState("");
  const [wizardTools, setWizardTools] = useState<string[]>(DEFAULT_MCP_TOOLS);
  const [wizardWorkflow, setWizardWorkflow] = useState("inspect, analyze, summarize");
  const [wizardOverwrite, setWizardOverwrite] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0]!;
    if (file.name.toLowerCase().endsWith(".zip")) {
      setSelectedSourceType("zip");
      setSourcePath(file.name);
      await loadZipFile(file);
    } else {
      const filePath = (file as any).path || file.name;
      setSelectedSourceType("folder");
      setSourcePath(filePath);
      await loadFolderPreview(filePath);
    }
  };

  const syncWizardFieldsFromPreview = (prev: SkillImportPreview) => {
    const zh = prev.name["zh-CN"] || prev.name[language] || prev.id;
    const en = prev.name["en-US"] || prev.id;
    setWizardNameZh(zh);
    setWizardNameEn(en);
    setWizardId(prev.id.startsWith("user.") ? prev.id : `user.${prev.id}`);
    setWizardDescZh(prev.description["zh-CN"] || prev.description[language] || "");
    setWizardDescEn(prev.description["en-US"] || prev.description["zh-CN"] || "");
    setWizardCategory(prev.category || "general");
    setWizardRisk(prev.risk || "medium");
    setWizardTriggers(prev.triggers.join(", ") || prev.id);
    setWizardTools(prev.tools.length > 0 ? prev.tools : DEFAULT_MCP_TOOLS);
    setWizardWorkflow(prev.workflow.join(", ") || "inspect, analyze, summarize");
  };

  const loadFolderPreview = async (folderPath: string, sub?: string) => {
    setPreviewLoading(true);
    setPreviewError(null);
    setImportError(null);
    setImportErrorData(null);
    setShowWizard(false);
    try {
      const prev = await bridge.previewSkillImport({
        sourceType: "folder",
        sourcePath: folderPath,
        target: selectedTarget,
        projectId,
        subPath: sub || undefined,
      });
      if (
        !sub &&
        prev.candidateSkills &&
        prev.candidateSkills.length > 0 &&
        prev.candidateQualityScore !== undefined &&
        prev.candidateQualityScore < 30
      ) {
        const firstValid =
          prev.candidateSkills.find((c) => c.isValidCandidate !== false) ||
          prev.candidateSkills[0];
        if (firstValid && firstValid.path) {
          setSelectedSubPath(firstValid.path);
          return loadFolderPreview(folderPath, firstValid.path);
        }
      }
      setPreview(prev);
      syncWizardFieldsFromPreview(prev);
    } catch (err: any) {
      setPreviewError(err?.message || "Failed to preview skill folder");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadZipPreview = async (pathOrBase64: { path?: string; base64?: string }, sub?: string) => {
    setPreviewLoading(true);
    setPreviewError(null);
    setImportError(null);
    setImportErrorData(null);
    setShowWizard(false);
    try {
      const prev = await bridge.previewSkillImport({
        sourceType: "zip",
        sourcePath: pathOrBase64.path,
        zipBase64: pathOrBase64.base64,
        target: selectedTarget,
        projectId,
        subPath: sub || undefined,
      });
      if (
        !sub &&
        prev.candidateSkills &&
        prev.candidateSkills.length > 0 &&
        prev.candidateQualityScore !== undefined &&
        prev.candidateQualityScore < 30
      ) {
        const firstValid =
          prev.candidateSkills.find((c) => c.isValidCandidate !== false) ||
          prev.candidateSkills[0];
        if (firstValid && firstValid.path) {
          setSelectedSubPath(firstValid.path);
          return loadZipPreview(pathOrBase64, firstValid.path);
        }
      }
      setPreview(prev);
      syncWizardFieldsFromPreview(prev);
    } catch (err: any) {
      setPreviewError(err?.message || "Failed to preview skill ZIP archive");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadZipFile = async (file: File) => {
    const filePath = (file as any).path;
    if (filePath) {
      setSourcePath(filePath);
      await loadZipPreview({ path: filePath });
    } else {
      const reader = new FileReader();
      reader.onload = async () => {
        const arrayBuf = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const b64 = btoa(binary);
        setZipBase64(b64);
        await loadZipPreview({ base64: b64 });
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const dirPath = await bridge.selectDirectory();
      if (dirPath) {
        setSelectedSourceType("folder");
        setSourcePath(dirPath);
        await loadFolderPreview(dirPath);
      }
    } catch {
      if (folderInputRef.current) {
        folderInputRef.current.click();
      }
    }
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const firstFile = files[0]!;
    const folderPath = (firstFile as any).path
      ? (firstFile as any).path.substring(0, (firstFile as any).path.lastIndexOf("\\"))
      : firstFile.webkitRelativePath.split("/")[0] || "folder";
    setSelectedSourceType("folder");
    setSourcePath(folderPath);
    await loadFolderPreview(folderPath);
  };

  const handleSelectZip = async () => {
    try {
      const zipPath = await bridge.selectZipFile();
      if (zipPath) {
        setSelectedSourceType("zip");
        setSourcePath(zipPath);
        await loadZipPreview({ path: zipPath });
      }
    } catch {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  const handleZipInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0]!;
    setSelectedSourceType("zip");
    setSourcePath(file.name);
    await loadZipFile(file);
  };

  const handleTargetChange = (target: "user" | "project") => {
    setSelectedTarget(target);
    if (preview && selectedSourceType === "folder" && sourcePath) {
      bridge
        .previewSkillImport({
          sourceType: "folder",
          sourcePath,
          target,
          projectId,
          subPath: selectedSubPath || undefined,
        })
        .then((p) => {
          setPreview(p);
          syncWizardFieldsFromPreview(p);
        })
        .catch(() => {});
    } else if (preview && selectedSourceType === "zip") {
      bridge
        .previewSkillImport({
          sourceType: "zip",
          sourcePath: sourcePath || undefined,
          zipBase64: zipBase64 || undefined,
          target,
          projectId,
          subPath: selectedSubPath || undefined,
        })
        .then((p) => {
          setPreview(p);
          syncWizardFieldsFromPreview(p);
        })
        .catch(() => {});
    }
  };

  const handleSubCandidateChange = (sub: string) => {
    setSelectedSubPath(sub);
    if (selectedSourceType === "folder" && sourcePath) {
      loadFolderPreview(sourcePath, sub);
    } else if (selectedSourceType === "zip") {
      loadZipPreview({ path: sourcePath || undefined, base64: zipBase64 || undefined }, sub);
    }
  };

  const roundTrip = React.useMemo(() => {
    const trigs = wizardTriggers
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const workflows = wizardWorkflow
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const manifestObj: SkillYamlInput = {
      id: wizardId.trim() || "user.custom-skill",
      version: "1.0.0",
      name: {
        "zh-CN": wizardNameZh.trim() || wizardId.trim() || "Custom Skill",
        "en-US": wizardNameEn.trim() || wizardId.trim() || "Custom Skill",
      },
      description: {
        "zh-CN": wizardDescZh.trim() || wizardNameZh.trim() || "Custom Skill Description",
        "en-US": wizardDescEn.trim() || wizardNameEn.trim() || "Custom Skill Description",
      },
      category: wizardCategory as any,
      risk: wizardRisk as any,
      triggers: trigs.length > 0 ? trigs : [wizardId.trim() || "skill"],
      tools: wizardTools.length > 0 ? wizardTools : ["localbridge_file_read"],
      workflow: workflows.length > 0 ? workflows : ["inspect"],
      enabled: true,
    };

    return validateSkillManifestRoundTrip(manifestObj);
  }, [
    wizardId,
    wizardNameZh,
    wizardNameEn,
    wizardDescZh,
    wizardDescEn,
    wizardCategory,
    wizardRisk,
    wizardTriggers,
    wizardTools,
    wizardWorkflow,
  ]);

  const buildWizardYaml = (): string => {
    return roundTrip.yaml;
  };

  const handleImport = async (overwrite = false, customYaml?: string) => {
    if (!preview && !customYaml) return;
    setImporting(true);
    setImportError(null);
    setImportErrorData(null);

    try {
      let result;
      const effectiveOverwrite = overwrite || wizardOverwrite;
      if (selectedSourceType === "folder") {
        result = await bridge.importSkillFolder({
          sourcePath,
          target: selectedTarget,
          projectId,
          projectRoot,
          overwrite: effectiveOverwrite,
          customYaml,
          subPath: selectedSubPath || undefined,
        });
      } else {
        result = await bridge.importSkillZip({
          sourcePath: sourcePath || undefined,
          zipBase64: zipBase64 || undefined,
          target: selectedTarget,
          projectId,
          projectRoot,
          overwrite: effectiveOverwrite,
          customYaml,
          subPath: selectedSubPath || undefined,
        });
      }

      if (result.success && result.skill) {
        onSuccess(result.skill);
        onClose();
      } else {
        const errMsg = result.error || result.message || result.validationErrors?.join("; ") || t.skills.importFailed;
        setImportError(errMsg);
        setImportErrorData({
          stage: result.stage,
          code: result.code,
          message: errMsg,
          details: result.details || result.validationErrors,
        });
      }
    } catch (err: any) {
      let stage: string | undefined;
      let code: string | undefined;
      let message = "Failed to import skill";
      let details: any;

      if (typeof err === "string") {
        try {
          const parsed = JSON.parse(err);
          stage = parsed.stage;
          code = parsed.code;
          message = parsed.error || parsed.message || err;
          details = parsed.details || parsed.validationErrors;
        } catch {
          message = err;
        }
      } else if (err && typeof err === "object") {
        stage = err.stage || err.data?.stage;
        code = err.code || err.data?.code;
        message = err.error || err.message || err.data?.error || err.data?.message || String(err);
        details = err.details || err.data?.details || err.validationErrors || err.data?.validationErrors;
      }

      setImportError(message);
      setImportErrorData({ stage, code, message, details });
    } finally {
      setImporting(false);
    }
  };

  const handleWizardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const yaml = buildWizardYaml();
    handleImport(wizardOverwrite, yaml);
  };

  const displayName = preview
    ? preview.name[language] || preview.name["zh-CN"] || preview.name["en-US"] || preview.id
    : "";

  const displayDesc = preview
    ? preview.description[language] ||
      preview.description["zh-CN"] ||
      preview.description["en-US"] ||
      ""
    : "";

  const renderStatusBadge = () => {
    if (!preview) return null;
    const status = preview.validationStatus;

    if (status === "valid") {
      return (
        <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>✓ Valid</span>
        </span>
      );
    }
    if (status === "warning") {
      return (
        <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>⚠ Valid with Warnings</span>
        </span>
      );
    }
    if (status === "needs_setup") {
      return (
        <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-md bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60">
          <Settings className="w-3.5 h-3.5" />
          <span>⚙ Needs Setup</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>✕ Invalid</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-white dark:bg-[#0d1320] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Section 1: Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/60 text-sky-600 dark:text-sky-400 shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {t.skills.importModalTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {language === "zh-CN"
                  ? "支持标准 Nexus Skill 或普通 GitHub 仓库兼容包"
                  : "Supports Nexus Native Skills and compatible GitHub repository packages"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title={t.common.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Hidden File Inputs */}
          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFolderInputChange}
            className="hidden"
            // @ts-ignore
            webkitdirectory=""
            directory=""
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleZipInputChange}
            accept=".zip"
            className="hidden"
          />

          {/* Section 2: Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`p-6 rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center ${
              isDragging
                ? "border-sky-500 bg-sky-50/60 dark:bg-sky-950/30 scale-[1.01]"
                : "border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-900/60 hover:border-sky-500/50"
            }`}
          >
            <div className="p-3 rounded-full bg-sky-100/80 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400 mb-3 shadow-2xs">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
              {t.skills.dragDropTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-sm">
              {language === "zh-CN"
                ? "Skill 仅保存在你的本地 Nexus 环境中。外部脚本将被声明式排除，绝不执行。"
                : "Skills stay locally on your device. External scripts are sanitized and never executed."}
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSelectFolder}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 shadow-2xs transition"
              >
                <FolderOpen className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>{t.skills.chooseFolder}</span>
              </button>

              <button
                type="button"
                onClick={handleSelectZip}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 shadow-2xs transition"
              >
                <Archive className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>{t.skills.chooseZip}</span>
              </button>
            </div>

            {sourcePath && (
              <div className="mt-3.5 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/60 text-xs font-mono text-sky-800 dark:text-sky-300 truncate max-w-md shadow-2xs flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="truncate">{sourcePath}</span>
              </div>
            )}
          </div>

          {/* Candidate Sub-Skill Picker (if multiple detected in subdirectories) */}
          {preview?.candidateSkills && preview.candidateSkills.length > 1 && (
            <div className="p-3.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 text-xs space-y-2">
              <label className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-2">
                <Workflow className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>发现多项候选子技能，请选择要导入的一项：</span>
              </label>
              <select
                value={selectedSubPath}
                onChange={(e) => handleSubCandidateChange(e.target.value)}
                className="w-full text-xs font-medium rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-slate-800 dark:text-slate-200"
              >
                <option value="">
                  {preview.candidateQualityScore !== undefined && preview.candidateQualityScore < 30
                    ? "仓库根目录 (未检测到独立技能特征)"
                    : "仓库根目录"}
                </option>
                {preview.candidateSkills.map((c) => (
                  <option key={c.path} value={c.path}>
                    {c.name} {c.hasManifest ? "(含 skill.yaml)" : "(含 SKILL.md)"} {c.qualityScore !== undefined ? `[评分: ${c.qualityScore}]` : ""}
                  </option>
                ))}
              </select>

              {preview.rootQualityNotice && !selectedSubPath && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{preview.rootQualityNotice}</span>
                </div>
              )}
            </div>
          )}

          {/* Section 3: Install Location Radio Cards */}
          <div>
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mb-2">
              {t.skills.installTarget}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl transition cursor-pointer ${
                  selectedTarget === "user"
                    ? "border-2 border-sky-500 bg-sky-50/60 dark:bg-sky-950/30 text-slate-900 dark:text-slate-100 shadow-xs"
                    : "border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="installTarget"
                  value="user"
                  checked={selectedTarget === "user"}
                  onChange={() => handleTargetChange("user")}
                  className="mt-0.5 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {language === "zh-CN" ? "用户技能" : "User Skill"}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {t.skills.targetUser}
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl transition ${
                  !projectId
                    ? "opacity-50 cursor-not-allowed bg-slate-100/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800"
                    : selectedTarget === "project"
                    ? "border-2 border-purple-500 bg-purple-50/60 dark:bg-purple-950/30 text-slate-900 dark:text-slate-100 cursor-pointer shadow-xs"
                    : "border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer"
                }`}
                title={!projectId ? t.skills.noProjectSelected : undefined}
              >
                <input
                  type="radio"
                  name="installTarget"
                  value="project"
                  disabled={!projectId}
                  checked={selectedTarget === "project"}
                  onChange={() => handleTargetChange("project")}
                  className="mt-0.5 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {language === "zh-CN" ? "当前项目" : "Project Skill"}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {!projectId ? t.skills.noProjectSelected : t.skills.targetProject}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Preview Loading Indicator */}
          {previewLoading && (
            <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-sky-600 dark:text-sky-400" />
              <span>{t.common.loading}...</span>
            </div>
          )}

          {/* Preview Error Banner */}
          {previewError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{t.skills.importFailed}: </span>
                <span>{previewError}</span>
              </div>
            </div>
          )}

          {/* Structured Import Error Banner */}
          {(importErrorData || importError) && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs space-y-2 shadow-xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{t.skills.importFailed}</span>
                {importErrorData?.code && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                    {importErrorData.code}
                  </span>
                )}
              </div>

              {importErrorData?.stage && (
                <div className="text-[11px] text-rose-700 dark:text-rose-300">
                  <span className="font-semibold">{language === "zh-CN" ? "阶段：" : "Stage: "}</span>
                  <span>{formatStageName(importErrorData.stage, language)}</span>
                </div>
              )}

              <div className="text-[11px] text-rose-800 dark:text-rose-200 leading-relaxed">
                <span className="font-semibold">{language === "zh-CN" ? "原因：" : "Reason: "}</span>
                <span>{importErrorData?.message || importError}</span>
              </div>

              {importErrorData?.details && Array.isArray(importErrorData.details) && importErrorData.details.length > 0 && (
                <div className="mt-1 pt-1 border-t border-rose-200/60 dark:border-rose-800/40 text-[10px] font-mono space-y-0.5 text-rose-700 dark:text-rose-300 max-h-24 overflow-y-auto">
                  {importErrorData.details.map((d: any, i: number) => (
                    <div key={i}>• {String(d)}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 4: Skill Preview Card */}
          {preview && !previewLoading && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3.5 shadow-2xs animate-in fade-in duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/60 text-sky-600 dark:text-sky-400 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {displayName}
                    </h4>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {preview.id} · v{preview.version}
                    </div>
                  </div>
                </div>

                {/* Validation Status Badge */}
                {renderStatusBadge()}
              </div>

              {displayDesc && (
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-2">
                  {displayDesc}
                </p>
              )}

              {/* Metrics Strip */}
              <div className="flex items-center gap-4 text-xs font-mono text-slate-600 dark:text-slate-400 pt-2.5 border-t border-slate-200 dark:border-slate-800">
                <span className="flex items-center gap-1">
                  <Workflow className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>
                    {preview.workflowStepsCount} {t.skills.workflowSteps}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Wrench className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>
                    {preview.toolsCount} {t.skills.toolsCount}
                  </span>
                </span>
                <span className="uppercase text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  {preview.risk} Risk
                </span>
              </div>

              {/* Needs Setup Conversion Prompt */}
              {preview.validationStatus === "needs_setup" && (
                <div className="p-3.5 rounded-lg bg-sky-50/80 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                      <Settings className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      <span>未发现 Nexus skill.yaml</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowWizard(!showWizard)}
                      className="px-3 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] shadow-2xs transition flex items-center gap-1"
                    >
                      <span>{showWizard ? "收起向导" : "转换为 Nexus Skill"}</span>
                      {showWizard ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                    此外部包包含说明文档（SKILL.md / README.md），你可以通过配置向导快速为其生成 Nexus 声明式定义并安装。
                  </p>
                </div>
              )}

              {/* Config Wizard Form */}
              {showWizard && (
                <form onSubmit={handleWizardSubmit} className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs space-y-3">
                  <h5 className="font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
                    创建 Nexus 声明式 Skill 配置
                  </h5>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        技能中文名 (Name zh-CN)
                      </label>
                      <input
                        type="text"
                        value={wizardNameZh}
                        onChange={(e) => setWizardNameZh(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        技能英文名 (Name en-US)
                      </label>
                      <input
                        type="text"
                        value={wizardNameEn}
                        onChange={(e) => setWizardNameEn(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        技能中文描述 (Description zh-CN)
                      </label>
                      <textarea
                        rows={2}
                        value={wizardDescZh}
                        onChange={(e) => setWizardDescZh(e.target.value)}
                        placeholder="请填写技能用途"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs resize-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        技能英文描述 (Description en-US)
                      </label>
                      <textarea
                        rows={2}
                        value={wizardDescEn}
                        onChange={(e) => setWizardDescEn(e.target.value)}
                        placeholder="Skill purpose"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs resize-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Skill ID (小写字母/数字/点/破折号)
                    </label>
                    <input
                      type="text"
                      value={wizardId}
                      onChange={(e) => setWizardId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-mono"
                      pattern="^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        分类 (Category)
                      </label>
                      <select
                        value={wizardCategory}
                        onChange={(e) => setWizardCategory(e.target.value as SkillCategory)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                      >
                        <option value="inspection">inspection</option>
                        <option value="debugging">debugging</option>
                        <option value="testing">testing</option>
                        <option value="refactoring">refactoring</option>
                        <option value="review">review</option>
                        <option value="runtime">runtime</option>
                        <option value="maintenance">maintenance</option>
                        <option value="general">general</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        风险等级 (Risk)
                      </label>
                      <select
                        value={wizardRisk}
                        onChange={(e) => setWizardRisk(e.target.value as SkillRisk)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      触发关键词 (Triggers, 逗号分隔)
                    </label>
                    <input
                      type="text"
                      value={wizardTriggers}
                      onChange={(e) => setWizardTriggers(e.target.value)}
                      placeholder="e.g. 逆向, 分析, reverse analysis"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      工作流步骤 (Workflow, 逗号分隔)
                    </label>
                    <input
                      type="text"
                      value={wizardWorkflow}
                      onChange={(e) => setWizardWorkflow(e.target.value)}
                      placeholder="e.g. inspect, analyze, summarize"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                      required
                    />
                  </div>

                  {/* Live Manifest Preview & Round-Trip Validation Status */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                        <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                        <span>生成的 Manifest 预览 (Generated Manifest Preview)</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                            roundTrip.valid
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60"
                              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60"
                          }`}
                        >
                          {roundTrip.valid ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          <span>YAML Serialization Valid</span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                            roundTrip.valid
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60"
                              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60"
                          }`}
                        >
                          {roundTrip.valid ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          <span>Skill Schema Valid</span>
                        </span>
                      </div>
                    </div>

                    {!roundTrip.valid && roundTrip.errors.length > 0 && (
                      <div className="p-2 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-300">
                        <div className="font-semibold mb-1">Manifest 校验未通过：</div>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {roundTrip.errors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="bg-slate-900 dark:bg-slate-950 rounded-lg p-2.5 font-mono text-[11px] text-slate-200 overflow-x-auto max-h-40 border border-slate-800">
                      <pre>{roundTrip.yaml || "等待配置..."}</pre>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wizardOverwrite}
                        onChange={(e) => setWizardOverwrite(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>{language === "zh-CN" ? "若同名技能已存在则覆盖安装" : "Overwrite if skill already exists"}</span>
                    </label>

                    <button
                      type="submit"
                      disabled={importing || !roundTrip.valid}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-xs"
                    >
                      {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>生成并导入为 Nexus Skill</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Excluded Executable Files Summary & Expander */}
              {(preview.archiveTotalExecutables !== undefined && preview.archiveTotalExecutables > 0) ? (
                <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="font-semibold">
                        {language === "zh-CN"
                          ? `归档共发现 ${preview.archiveTotalExecutables} 个可执行资源，当前候选包含 ${preview.candidateExecutablesCount ?? 0} 个，导入时全部排除`
                          : `Archive contains ${preview.archiveTotalExecutables} executables, candidate contains ${preview.candidateExecutablesCount ?? 0}, all excluded`}
                      </span>
                    </div>
                    {preview.executableFilesFound && preview.executableFilesFound.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowExcludedFiles(!showExcludedFiles)}
                        className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1"
                      >
                        <span>{showExcludedFiles ? "收起" : `查看候选文件 (${preview.executableFilesFound.length})`}</span>
                        {showExcludedFiles ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80 leading-relaxed">
                    {language === "zh-CN"
                      ? "出于安全原因，任何外部脚本与二进制文件绝不进入 Nexus Skill 目录，且绝不被执行。技能仅作为纯声明式元数据导入。"
                      : "For security, external scripts and binaries are excluded and never executed. The skill imports as declarative metadata only."}
                  </p>

                  {showExcludedFiles && preview.executableFilesFound && preview.executableFilesFound.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto p-2 rounded bg-amber-100/50 dark:bg-black/40 border border-amber-200 dark:border-amber-900/60 font-mono text-[10px] space-y-0.5 text-slate-800 dark:text-slate-300">
                      {preview.executableFilesFound.map((file, i) => (
                        <div key={i} className="truncate">
                          ✕ {file}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (preview.executableFilesFound && preview.executableFilesFound.length > 0) ? (
                <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="font-semibold">
                        ⚠ 发现 {preview.executableFilesFound.length} 个可执行资源
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowExcludedFiles(!showExcludedFiles)}
                      className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1"
                    >
                      <span>{showExcludedFiles ? "收起" : `查看文件列表 (${preview.executableFilesFound.length})`}</span>
                      {showExcludedFiles ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80 leading-relaxed">
                    出于安全原因，这些脚本与二进制文件不会被复制到 Nexus Skill 安装目录中，且绝不会被执行。
                  </p>

                  {showExcludedFiles && (
                    <div className="mt-2 max-h-32 overflow-y-auto p-2 rounded bg-amber-100/50 dark:bg-black/40 border border-amber-200 dark:border-amber-900/60 font-mono text-[10px] space-y-0.5 text-slate-800 dark:text-slate-300">
                      {preview.executableFilesFound.map((file, i) => (
                        <div key={i} className="truncate">
                          ✕ {file}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Conflict Alert */}
              {preview.isBuiltinConflict ? (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>nexus.* 命名空间仅供 Nexus 官方内置技能使用。</span>
                </div>
              ) : preview.hasConflict ? (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {language === "zh-CN"
                      ? `该 Skill 已存在 (当前版本: ${preview.existingVersion}，待导入版本: ${preview.version})`
                      : `Skill already exists (Current: v${preview.existingVersion}, Incoming: v${preview.version})`}
                  </span>
                </div>
              ) : null}

              {/* Validation Errors List (if invalid) */}
              {preview.validationStatus === "invalid" && preview.validationErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs space-y-1">
                  <div className="font-semibold">{t.skills.validationErrorsTitle}:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {preview.validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Section 5: Security Info Box */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5 leading-relaxed shadow-2xs">
            <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <span>
              {language === "zh-CN"
                ? "Nexus Skill 始终以只读声明式元数据运行。任何外部脚本均已被净化排除。所有系统操作必须经由 64 个 Nexus MCP 工具显式完成，并受审批与紧急停止约束。"
                : "Nexus Skills remain declarative-only. External scripts are excluded and never executed. System operations require explicit MCP tool calls bounded by approval."}
            </span>
          </div>
        </div>

        {/* Section 6: Modal Footer with Visible Disabled Button */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/70 dark:bg-slate-900/30">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-2xs"
          >
            {t.common.cancel}
          </button>

          {preview && preview.hasConflict && !preview.isBuiltinConflict ? (
            <button
              type="button"
              onClick={() => handleImport(true)}
              disabled={importing || !preview.valid}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-xs transition disabled:opacity-65 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:border disabled:border-slate-200 dark:disabled:border-slate-700 disabled:shadow-none"
            >
              {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t.skills.replaceButton}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleImport(false)}
              disabled={
                importing ||
                !preview ||
                (!preview.valid && preview.validationStatus !== "warning") ||
                preview.isBuiltinConflict ||
                preview.validationStatus === "needs_setup"
              }
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition disabled:opacity-65 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:border disabled:border-slate-200 dark:disabled:border-slate-700 disabled:shadow-none"
            >
              {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t.skills.importButton}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
