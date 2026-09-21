import React, { useState } from "react";
import {
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Clock,
  FolderGit2,
  Check,
  X,
  Copy,
  Brain,
} from "lucide-react";
import type { Approval, DecisionAdvice } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface ApprovalCardProps {
  approval: Approval;
  projectName?: string;
  onApprove: (id: string) => Promise<void>;
  onDeny: (id: string) => Promise<void>;
  isProcessing?: boolean;
  advice?: DecisionAdvice | null;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  approval,
  projectName,
  onApprove,
  onDeny,
  isProcessing,
  advice,
}) => {
  const { t, language } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const effectiveAdvice = advice || approval.advice;
  const rawRisk = effectiveAdvice ? (typeof effectiveAdvice.risk === "object" ? effectiveAdvice.risk?.label : (effectiveAdvice as any).risk) : null;
  const riskKey = String(rawRisk || "").toUpperCase();
  const rawConf = effectiveAdvice ? (typeof effectiveAdvice.risk === "object" ? effectiveAdvice.risk?.confidence : (effectiveAdvice as any).confidence) : 0.85;
  const confPercent = Math.round(Number(rawConf ?? 0.85) * 100);
  const isHighRisk = riskKey === "HIGH" || riskKey === "CRITICAL";
  const isMediumRisk = riskKey === "MEDIUM";
  const adviceRecommendation = effectiveAdvice ? ((effectiveAdvice as any).recommendation || (effectiveAdvice.approval?.recommended ? "APPROVE" : "ASK / REVIEW")) : "";
  const adviceCategory = effectiveAdvice ? (effectiveAdvice.category || "General") : "";
  const adviceRationale = effectiveAdvice ? ((effectiveAdvice as any).rationale || (effectiveAdvice.reasoningTags && effectiveAdvice.reasoningTags.length > 0 ? effectiveAdvice.reasoningTags.join(", ") : null)) : null;

  const isDangerous = approval.risk === "DANGEROUS";
  const timeLeftMs = Math.max(0, approval.expiresAt - Date.now());
  const minutesLeft = Math.ceil(timeLeftMs / 60000);

  const handleCopyId = () => {
    navigator.clipboard.writeText(approval.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-150 overflow-hidden ${
        isDangerous
          ? "bg-red-500/5 dark:bg-red-950/20 border-red-500/30"
          : "bg-theme-card border-theme-subtle"
      }`}
    >
      {/* Main Bar */}
      <div className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`p-2 rounded-lg shrink-0 mt-0.5 ${
              isDangerous
                ? "bg-red-500/15 text-red-500"
                : "bg-amber-500/15 text-amber-500"
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-theme-primary">
                {approval.clientName
                  ? `${approval.clientName} ${language === "zh-CN" ? "请求执行:" : "wants to execute:"}`
                  : (t.approvalCard?.wantsToExecute || "AI wants to execute:")}
              </span>
              {approval.clientName && (
                <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  {approval.clientName}
                </span>
              )}
              <span className="px-2 py-0.5 rounded font-mono text-xs bg-theme-card-muted text-sky-600 dark:text-sky-300 border border-theme-subtle truncate max-w-md">
                {approval.operation}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                  isDangerous
                    ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                }`}
              >
                {approval.risk}
              </span>
              <span
                className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center gap-1"
                title="Nexus Security Policy (Deterministic & Enforced)"
              >
                <span className="opacity-75">{t.approvalCard?.nexusPolicyLabel || "Nexus Policy"}:</span>
                <span>{approval.policy || "ASK"}</span>
              </span>

              {/* Laya Multilingual Advisory Badge */}
              {effectiveAdvice && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium border flex items-center gap-1.5 shadow-sm ${
                    isHighRisk
                      ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                      : isMediumRisk
                        ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30"
                        : "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30"
                  }`}
                  title={t.approvalCard?.advisoryDisclaimer || "Advisory only · Nexus deterministic policy always takes precedence"}
                >
                  <Brain className="w-3 h-3 shrink-0 text-purple-600 dark:text-purple-400" />
                  <span className="font-semibold">
                    {t.approvalCard?.aiAdviceLabel || "AI Advice"}:
                  </span>
                  <span>
                    {isHighRisk
                      ? (t.approvalCard?.riskHigh || "HIGH")
                      : isMediumRisk
                        ? (t.approvalCard?.riskMedium || "MEDIUM")
                        : (t.approvalCard?.riskSafe || "SAFE")}
                    {" · "}{confPercent}%{" · "}
                    <span className="opacity-80 italic">
                      {language === "zh-CN" ? "仅供参考" : "Advisory Only"}
                    </span>
                  </span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-[11px] text-theme-muted font-mono flex-wrap">
              <span className="flex items-center gap-1 text-theme-secondary">
                <FolderGit2 className="w-3 h-3 text-theme-muted" />
                <span>{projectName || approval.projectId}</span>
              </span>
              <span>&bull;</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-theme-muted" />
                <span>
                  {t.approvalCard?.expiresIn || "Expires in"} {minutesLeft}m
                </span>
              </span>
              <span>&bull;</span>
              <span className="truncate max-w-sm text-theme-muted">
                {approval.summary}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onDeny(approval.id)}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 transition disabled:opacity-50"
            title={t.approvalCard?.deny || "Deny"}
          >
            <X className="w-3.5 h-3.5" />
            <span>{t.approvalCard?.deny || "Deny"}</span>
          </button>

          <button
            onClick={() => onApprove(approval.id)}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition disabled:opacity-50"
            title={t.approvalCard?.approve || "Approve"}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isProcessing ? (t.approvalCard?.processing || "...") : (t.approvalCard?.approve || "Approve")}</span>
          </button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
            title={
              expanded
                ? (t.approvalCard?.hideDetails || "Hide technical details")
                : (t.approvalCard?.showDetails || "Show technical details")
            }
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable Technical Details Drawer */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-theme-subtle bg-theme-card-muted text-xs font-mono space-y-3">
          <div className="text-[10px] uppercase font-bold tracking-wider text-theme-muted">
            {t.approvalCard?.techSpecTitle || "Technical Specification & Audit Payload"}
          </div>

          {/* Laya Advisory Full Analysis Block */}
          {effectiveAdvice && (
            <div className="p-3 rounded-lg bg-theme-card border border-theme-subtle space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  <span>{t.approvalCard?.aiRiskAdvice || "Decision Intelligence (Laya)"}</span>
                </span>
                <span className="text-[10px] text-theme-muted font-mono">
                  {t.approvalCard?.advisoryDisclaimer || "Advisory only"}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                <div>
                  <span className="text-theme-muted">{t.intelligence?.riskEvaluation || "Risk"}: </span>
                  <span className="font-semibold text-theme-primary">
                    {riskKey || "UNKNOWN"} ({confPercent}%)
                  </span>
                </div>
                <div>
                  <span className="text-theme-muted">{t.intelligence?.recommendedAction || "Recommendation"}: </span>
                  <span className="font-mono font-medium text-theme-primary">{adviceRecommendation}</span>
                </div>
                <div>
                  <span className="text-theme-muted">Category: </span>
                  <span className="font-mono text-theme-secondary">{adviceCategory}</span>
                </div>
              </div>
              {adviceRationale && (
                <div className="text-[11px] text-theme-secondary italic bg-theme-card-muted p-2 rounded border border-theme-subtle">
                  "{adviceRationale}"
                </div>
              )}
              <div className="text-[10px] text-theme-muted">
                {t.approvalCard?.sanitizedNotice || "Sensitive credentials and paths sanitized before inference."}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            <div className="p-2.5 rounded bg-theme-card border border-theme-subtle space-y-1">
              <div className="text-theme-muted text-[10px]">
                {t.approvalCard?.operation || "Operation"}
              </div>
              <div className="text-sky-600 dark:text-sky-300 font-semibold truncate">
                {approval.operation}
              </div>
            </div>

            {approval.clientName && (
              <div className="p-2.5 rounded bg-theme-card border border-theme-subtle space-y-1">
                <div className="text-theme-muted text-[10px]">
                  {language === "zh-CN" ? "发起请求客户端" : "Requesting AI Client"}
                </div>
                <div className="text-sky-600 dark:text-sky-300 font-semibold truncate flex items-center gap-1.5">
                  <span>{approval.clientName}</span>
                  {approval.clientType && (
                    <span className="text-[10px] font-mono text-theme-muted">({approval.clientType})</span>
                  )}
                </div>
              </div>
            )}

            <div className="p-2.5 rounded bg-theme-card border border-theme-subtle space-y-1">
              <div className="text-theme-muted text-[10px]">
                {t.approvalCard?.targetProject || "Target Project ID"}
              </div>
              <div className="text-theme-secondary font-mono truncate">
                {approval.projectId}
              </div>
            </div>

            <div className="p-2.5 rounded bg-theme-card border border-theme-subtle space-y-1">
              <div className="text-theme-muted text-[10px]">
                {t.approvalCard?.payloadHash || "Payload Hash (SHA-256)"}
              </div>
              <div className="text-theme-secondary truncate font-mono">
                {approval.payloadHash}
              </div>
            </div>

            <div className="p-2.5 rounded bg-theme-card border border-theme-subtle space-y-1 flex items-center justify-between">
              <div>
                <div className="text-theme-muted text-[10px]">
                  {t.approvalCard?.id || "Approval Request ID"}
                </div>
                <div className="text-theme-secondary truncate font-mono">
                  {approval.id}
                </div>
              </div>
              <button
                onClick={handleCopyId}
                className="p-1 rounded hover:bg-theme-card-hover text-theme-muted hover:text-theme-primary transition"
                title={copied ? (t.approvalCard?.copied || "Copied") : (t.approvalCard?.copyId || "Copy ID")}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded bg-theme-card border border-theme-subtle space-y-1">
            <div className="text-theme-muted text-[10px]">
              {t.approvalCard?.summary || "Summary & Context"}
            </div>
            <div className="text-theme-secondary whitespace-pre-wrap">
              {approval.summary}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
