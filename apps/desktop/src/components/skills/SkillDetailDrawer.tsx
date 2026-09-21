import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  Wrench,
  Workflow,
  FileCode,
  Tag,
  Copy,
  Check,
} from "lucide-react";
import type { SkillDefinition } from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { bridge } from "../../api/bridge.js";

interface SkillDetailDrawerProps {
  skillId: string | null;
  projectId?: string;
  onClose: () => void;
}

export const SkillDetailDrawer: React.FC<SkillDetailDrawerProps> = ({
  skillId,
  projectId,
  onClose,
}) => {
  const { t, language } = useTranslation();
  const [skill, setSkill] = useState<SkillDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!skillId) {
      setSkill(null);
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

  if (!skillId) return null;

  const handleCopyId = () => {
    if (skill) {
      navigator.clipboard.writeText(skill.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  const displayName =
    skill?.name[language] ||
    skill?.name["zh-CN"] ||
    skill?.name["en-US"] ||
    skill?.id;

  const displayDesc =
    skill?.description[language] ||
    skill?.description["zh-CN"] ||
    skill?.description["en-US"] ||
    "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-theme-base border-l border-theme-subtle h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-theme-subtle flex items-center justify-between bg-theme-sidebar/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-500 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-theme-primary truncate">
                  {displayName}
                </h2>
                {skill && (
                  <span
                    className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border font-semibold ${getRiskBadge(
                      skill.risk
                    )}`}
                  >
                    {skill.risk} {t.skills?.riskLow?.split(" ")[1] || "Risk"}
                  </span>
                )}
                {skill?.source === "builtin" && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500 border border-sky-500/20">
                    Built-in
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-theme-muted font-mono">
                <span className="truncate">{skillId}</span>
                <button
                  onClick={handleCopyId}
                  className="hover:text-theme-primary transition p-0.5"
                  title="Copy ID"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
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

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading && (
            <div className="py-16 text-center text-sm text-theme-muted">
              {t.common.loading}
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {skill && !loading && (
            <>
              {/* Security Warning Alert */}
              {skill.securityWarning && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm flex items-start gap-3">
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
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                  <h4 className="font-semibold text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    {t.skills.validationErrorsTitle}
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    {skill.validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Description */}
              <div>
                <p className="text-sm text-theme-secondary leading-relaxed">
                  {displayDesc}
                </p>
              </div>

              {/* Workflow Pipeline */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Workflow className="w-4 h-4 text-sky-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
                    {t.skills.workflowPipeline} ({skill.workflow.length}{" "}
                    {t.skills.workflowSteps})
                  </h3>
                </div>
                <div className="space-y-1.5">
                  {skill.workflow.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-theme-card border border-theme-subtle text-xs"
                    >
                      <span className="w-5 h-5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-500 flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-mono text-theme-primary">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommended MCP Tools */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Wrench className="w-4 h-4 text-sky-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
                    {t.skills.allowedTools} ({skill.tools.length}{" "}
                    {t.skills.toolsCount})
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {skill.tools.map((tool) => (
                    <div
                      key={tool}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-card border border-theme-subtle text-xs font-mono text-theme-secondary hover:text-theme-primary transition truncate"
                      title={tool}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="truncate">{tool}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Triggers */}
              {skill.triggers && skill.triggers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Tag className="w-4 h-4 text-sky-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
                      {t.skills.triggers}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {skill.triggers.map((trigger, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-md bg-theme-card-muted border border-theme-subtle text-xs text-theme-secondary"
                      >
                        {trigger}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* SKILL.md Markdown Instructions */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <FileCode className="w-4 h-4 text-sky-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
                    {t.skills.instructionsTitle}
                  </h3>
                </div>
                <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle text-xs text-theme-secondary font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto select-text">
                  {skill.instructions || "No SKILL.md instructions provided."}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
