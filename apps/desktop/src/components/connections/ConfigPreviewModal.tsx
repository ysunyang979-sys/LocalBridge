import React from "react";
import { X, CheckCircle2, ShieldCheck, FileText } from "lucide-react";
import type { ConfigPreviewResult } from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface ConfigPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: ConfigPreviewResult | null;
  onConfirmApply: () => Promise<void>;
  isApplying: boolean;
  clientName: string;
}

export const ConfigPreviewModal: React.FC<ConfigPreviewModalProps> = ({
  isOpen,
  onClose,
  preview,
  onConfirmApply,
  isApplying,
  clientName,
}) => {
  const { t } = useTranslation();

  if (!isOpen || !preview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-theme-card border border-theme-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-theme-primary">
                {t.aiConnections?.diffPreviewTitle || "Confirm Client Config Update"}
              </h2>
              <p className="text-xs text-theme-muted">
                {clientName} &bull; {preview.configFilePath}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isApplying}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono">
          {/* Security & Backup banner */}
          <div className="p-3 rounded-xl bg-sky-500/5 border border-sky-500/20 space-y-1.5 font-sans">
            <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4 text-sky-500" />
              <span>{preview.diffSummary || t.aiConnections?.diffPreviewDesc || "Nexus atomically patches client config with backup protection."}</span>
            </div>
            <p className="text-[11px] text-theme-muted">
              {t.aiConnections?.rollbackNotice || "If validation fails after writing, Nexus automatically rolls back."}
            </p>
          </div>

          {/* Target File Path */}
          <div>
            <span className="text-theme-muted uppercase tracking-wider text-[10px] font-sans font-bold">
              {t.aiConnections?.targetPath || "Target Config Path"}:
            </span>
            <div className="mt-1 p-2.5 rounded-lg bg-theme-card-muted border border-theme-subtle text-theme-primary break-all">
              {preview.configFilePath}
            </div>
          </div>

          {/* Backup Location Notice */}
          <div>
            <span className="text-theme-muted uppercase tracking-wider text-[10px] font-sans font-bold">
              {t.aiConnections?.backupNotice || "Backup will be created at"}:
            </span>
            <div className="mt-1 p-2 rounded-lg bg-theme-card-muted border border-theme-subtle text-theme-muted break-all text-[11px]">
              {preview.configFilePath}.nexus.bak.&lt;timestamp&gt;
            </div>
          </div>

          {/* Snippet / Diff Display */}
          <div>
            <span className="text-theme-muted uppercase tracking-wider text-[10px] font-sans font-bold">
              MCP Configuration Snippet:
            </span>
            <div className="mt-1 p-3 rounded-lg bg-zinc-950 text-zinc-100 border border-zinc-800 text-[11px] overflow-x-auto max-h-56">
              <pre className="font-mono">
                {preview.afterContent}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-theme-subtle bg-theme-card-muted flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="px-4 py-2 rounded-lg text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover border border-theme-subtle transition"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirmApply}
            disabled={isApplying}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {isApplying
                ? (t.aiConnections?.applyingConfig || "Writing...")
                : (t.aiConnections?.confirmApply || "Confirm & Apply")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
