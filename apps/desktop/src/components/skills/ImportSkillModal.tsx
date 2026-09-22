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
} from "lucide-react";
import type {
  SkillImportPreview,
  SkillMetadata,
} from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { bridge } from "../../api/bridge.js";

interface ImportSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (skill: SkillMetadata) => void;
  projectId?: string;
  projectRoot?: string;
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

  const [preview, setPreview] = useState<SkillImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

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
      // In web or Tauri, folder drag might give files or a directory path
      const filePath = (file as any).path || file.name;
      setSelectedSourceType("folder");
      setSourcePath(filePath);
      await loadFolderPreview(filePath);
    }
  };

  const loadFolderPreview = async (folderPath: string) => {
    setPreviewLoading(true);
    setPreviewError(null);
    setImportError(null);
    try {
      const prev = await bridge.previewSkillImport({
        sourceType: "folder",
        sourcePath: folderPath,
        target: selectedTarget,
        projectId,
      });
      setPreview(prev);
    } catch (err: any) {
      setPreviewError(err?.message || "Failed to preview skill folder");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadZipPreview = async (pathOrBase64: { path?: string; base64?: string }) => {
    setPreviewLoading(true);
    setPreviewError(null);
    setImportError(null);
    try {
      const prev = await bridge.previewSkillImport({
        sourceType: "zip",
        sourcePath: pathOrBase64.path,
        zipBase64: pathOrBase64.base64,
        target: selectedTarget,
        projectId,
      });
      setPreview(prev);
    } catch (err: any) {
      setPreviewError(err?.message || "Failed to preview skill ZIP archive");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadZipFile = async (file: File) => {
    // If Tauri provides native path
    const filePath = (file as any).path;
    if (filePath) {
      setSourcePath(filePath);
      await loadZipPreview({ path: filePath });
    } else {
      // Fallback: read ArrayBuffer to Base64
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
    const selected = await bridge.selectDirectory();
    if (selected) {
      setSelectedSourceType("folder");
      setSourcePath(selected);
      setZipBase64("");
      await loadFolderPreview(selected);
    } else if (folderInputRef.current) {
      folderInputRef.current.click();
    }
  };

  const handleSelectZip = async () => {
    const selected = await bridge.selectZipFile();
    if (selected) {
      setSelectedSourceType("zip");
      setSourcePath(selected);
      setZipBase64("");
      await loadZipPreview({ path: selected });
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const first = files[0]!;
      const fullPath = (first as any).path || "";
      if (fullPath) {
        // Find folder parent
        const parts = fullPath.split(/[/\\]/);
        parts.pop();
        const dir = parts.join("/");
        setSelectedSourceType("folder");
        setSourcePath(dir);
        await loadFolderPreview(dir);
      }
    }
  };

  const handleZipInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0]!;
      setSelectedSourceType("zip");
      setSourcePath(file.name);
      await loadZipFile(file);
    }
  };

  const handleTargetChange = async (newTarget: "user" | "project") => {
    setSelectedTarget(newTarget);
    if (selectedSourceType === "folder" && sourcePath) {
      setPreviewLoading(true);
      try {
        const prev = await bridge.previewSkillImport({
          sourceType: "folder",
          sourcePath,
          target: newTarget,
          projectId,
        });
        setPreview(prev);
      } catch (err: any) {
        setPreviewError(err?.message || "Failed to update preview");
      } finally {
        setPreviewLoading(false);
      }
    } else if (selectedSourceType === "zip" && (sourcePath || zipBase64)) {
      setPreviewLoading(true);
      try {
        const prev = await bridge.previewSkillImport({
          sourceType: "zip",
          sourcePath: sourcePath || undefined,
          zipBase64: zipBase64 || undefined,
          target: newTarget,
          projectId,
        });
        setPreview(prev);
      } catch (err: any) {
        setPreviewError(err?.message || "Failed to update preview");
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const handleImport = async (overwrite: boolean = false) => {
    if (!preview || !preview.valid) return;

    setImporting(true);
    setImportError(null);

    try {
      let result;
      if (selectedSourceType === "folder") {
        result = await bridge.importSkillFolder({
          sourcePath,
          target: selectedTarget,
          projectId,
          projectRoot,
          overwrite,
        });
      } else {
        result = await bridge.importSkillZip({
          sourcePath: sourcePath || undefined,
          zipBase64: zipBase64 || undefined,
          target: selectedTarget,
          projectId,
          projectRoot,
          overwrite,
        });
      }

      if (result.success && result.skill) {
        onSuccess(result.skill);
        onClose();
      } else {
        const errMsg = result.error || result.validationErrors?.join("; ") || t.skills.importFailed;
        setImportError(errMsg);
      }
    } catch (err: any) {
      setImportError(err?.message || "Failed to import skill");
    } finally {
      setImporting(false);
    }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-theme-base border border-theme-subtle rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between bg-theme-sidebar/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-500 shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-theme-primary">
                {t.skills.importModalTitle}
              </h2>
              <p className="text-xs text-theme-muted">
                {t.skills.importModalSubtitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
            title={t.common.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
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

          {/* Drag and Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`p-6 rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center ${
              isDragging
                ? "border-sky-500 bg-sky-500/10 scale-[1.01]"
                : "border-theme-subtle bg-theme-card/50 hover:bg-theme-card hover:border-theme-subtle"
            }`}
          >
            <div className="p-3 rounded-full bg-sky-500/10 text-sky-500 mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-theme-primary mb-1">
              {t.skills.dragDropTitle}
            </h3>
            <p className="text-xs text-theme-muted mb-4 max-w-xs">
              {t.skills.importModalSubtitle}
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSelectFolder}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-theme-card border border-theme-subtle hover:bg-theme-card-hover text-xs font-medium text-theme-primary shadow-xs transition"
              >
                <FolderOpen className="w-4 h-4 text-sky-500" />
                <span>{t.skills.chooseFolder}</span>
              </button>

              <button
                type="button"
                onClick={handleSelectZip}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-theme-card border border-theme-subtle hover:bg-theme-card-hover text-xs font-medium text-theme-primary shadow-xs transition"
              >
                <Archive className="w-4 h-4 text-purple-500" />
                <span>{t.skills.chooseZip}</span>
              </button>
            </div>

            {sourcePath && (
              <div className="mt-3 text-[11px] font-mono text-theme-muted truncate max-w-md">
                {selectedSourceType === "folder" ? "📁 " : "📦 "}
                {sourcePath}
              </div>
            )}
          </div>

          {/* Installation Target Selection */}
          <div>
            <label className="text-xs font-semibold text-theme-primary block mb-2">
              {t.skills.installTarget}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  selectedTarget === "user"
                    ? "bg-sky-500/5 border-sky-500/40 text-theme-primary"
                    : "bg-theme-card border-theme-subtle text-theme-secondary hover:text-theme-primary"
                }`}
              >
                <input
                  type="radio"
                  name="installTarget"
                  value="user"
                  checked={selectedTarget === "user"}
                  onChange={() => handleTargetChange("user")}
                  className="mt-0.5 text-sky-500 focus:ring-sky-500"
                />
                <div>
                  <div className="text-xs font-semibold text-theme-primary">
                    {language === "zh-CN" ? "用户技能" : "User Skill"}
                  </div>
                  <div className="text-[11px] text-theme-muted mt-0.5">
                    {t.skills.targetUser}
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                  !projectId
                    ? "opacity-50 cursor-not-allowed bg-theme-card/30 border-theme-subtle"
                    : selectedTarget === "project"
                    ? "bg-purple-500/5 border-purple-500/40 text-theme-primary cursor-pointer"
                    : "bg-theme-card border-theme-subtle text-theme-secondary hover:text-theme-primary cursor-pointer"
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
                  className="mt-0.5 text-purple-500 focus:ring-purple-500"
                />
                <div>
                  <div className="text-xs font-semibold text-theme-primary">
                    {language === "zh-CN" ? "当前项目" : "Project Skill"}
                  </div>
                  <div className="text-[11px] text-theme-muted mt-0.5">
                    {!projectId ? t.skills.noProjectSelected : t.skills.targetProject}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Preview Loading */}
          {previewLoading && (
            <div className="p-6 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-center gap-2 text-xs text-theme-muted">
              <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
              <span>{t.common.loading}...</span>
            </div>
          )}

          {/* Preview Error */}
          {previewError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{t.skills.importFailed}: </span>
                <span>{previewError}</span>
              </div>
            </div>
          )}

          {/* Import Error */}
          {importError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{t.skills.importFailed}: </span>
                <span>{importError}</span>
              </div>
            </div>
          )}

          {/* Skill Preview Card */}
          {preview && !previewLoading && (
            <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle space-y-3.5 animate-in fade-in duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-theme-primary truncate">
                      {displayName}
                    </h4>
                    <div className="text-[11px] font-mono text-theme-muted truncate">
                      {preview.id} · v{preview.version}
                    </div>
                  </div>
                </div>

                {/* Validation Status Badge */}
                {preview.valid ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>✓ Valid</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                    <AlertCircle className="w-3 h-3" />
                    <span>✕ Invalid</span>
                  </span>
                )}
              </div>

              {displayDesc && (
                <p className="text-xs text-theme-secondary leading-relaxed line-clamp-2">
                  {displayDesc}
                </p>
              )}

              {/* Metrics strip */}
              <div className="flex items-center gap-4 text-xs font-mono text-theme-muted pt-2 border-t border-theme-subtle">
                <span className="flex items-center gap-1">
                  <Workflow className="w-3 h-3 text-sky-500" />
                  {preview.workflowStepsCount} {t.skills.workflowSteps}
                </span>
                <span className="flex items-center gap-1">
                  <Wrench className="w-3 h-3 text-sky-500" />
                  {preview.toolsCount} {t.skills.toolsCount}
                </span>
                <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-theme-card-muted border border-theme-subtle">
                  {preview.risk} Risk
                </span>
              </div>

              {/* Conflict Alert */}
              {preview.isBuiltinConflict ? (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>nexus.* 命名空间仅供 Nexus 官方内置技能使用。</span>
                </div>
              ) : preview.hasConflict ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {language === "zh-CN"
                      ? `该 Skill 已存在 (当前版本: ${preview.existingVersion}，待导入版本: ${preview.version})`
                      : `Skill already exists (Current: v${preview.existingVersion}, Incoming: v${preview.version})`}
                  </span>
                </div>
              ) : null}

              {/* Validation Errors List */}
              {preview.validationErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs space-y-1">
                  <div className="font-semibold">{t.skills.validationErrorsTitle}:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {preview.validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Security Warning */}
              {preview.securityWarning && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{preview.securityWarning}</span>
                </div>
              )}
            </div>
          )}

          {/* Security Note at bottom */}
          <div className="p-3 rounded-xl bg-theme-card-muted/60 border border-theme-subtle text-[11px] text-theme-muted flex items-start gap-2.5 leading-relaxed">
            <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <span>{t.skills.securityNote}</span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-theme-subtle flex items-center justify-end gap-3 bg-theme-sidebar/20">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 rounded-xl text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover transition"
          >
            {t.common.cancel}
          </button>

          {preview && preview.hasConflict && !preview.isBuiltinConflict ? (
            <button
              type="button"
              onClick={() => handleImport(true)}
              disabled={importing || !preview.valid}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition shadow-xs"
            >
              {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t.skills.replaceButton}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleImport(false)}
              disabled={importing || !preview || !preview.valid || preview.isBuiltinConflict}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition shadow-xs"
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
