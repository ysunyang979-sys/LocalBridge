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
} from "lucide-react";
import type { Approval } from "../types.js";

interface ApprovalCardProps {
  approval: Approval;
  projectName?: string;
  onApprove: (id: string) => Promise<void>;
  onDeny: (id: string) => Promise<void>;
  isProcessing?: boolean;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  approval,
  projectName,
  onApprove,
  onDeny,
  isProcessing,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

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
          ? "bg-[#140d12] border-red-500/25"
          : "bg-[#0d1320] border-amber-500/20"
      }`}
    >
      {/* Main Bar */}
      <div className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`p-2 rounded-lg shrink-0 mt-0.5 ${
              isDangerous
                ? "bg-red-500/15 text-red-400"
                : "bg-amber-500/15 text-amber-400"
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-theme-primary">
                AI wants to execute:
              </span>
              <span className="px-2 py-0.5 rounded font-mono text-xs bg-[#050810] text-sky-300 border border-white/[0.08] truncate max-w-md">
                {approval.operation}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                  isDangerous
                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                }`}
              >
                {approval.risk}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-theme-muted border border-white/[0.06]">
                POLICY: ASK
              </span>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-theme-muted font-mono flex-wrap">
              <span className="flex items-center gap-1 text-theme-secondary">
                <FolderGit2 className="w-3 h-3 text-theme-muted" />
                <span>{projectName || approval.projectId}</span>
              </span>
              <span>&bull;</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-theme-muted" />
                <span>Expires in {minutesLeft}m</span>
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition disabled:opacity-50"
            title="Deny request"
          >
            <X className="w-3.5 h-3.5" />
            <span>Deny</span>
          </button>

          <button
            onClick={() => onApprove(approval.id)}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition disabled:opacity-50"
            title="Approve request"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Approve</span>
          </button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-white/[0.06] transition"
            title={expanded ? "Hide technical details" : "Show technical details"}
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
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] bg-[#070b13] text-xs font-mono space-y-2">
          <div className="text-[10px] uppercase font-bold tracking-wider text-theme-muted">
            Technical Specification & Audit Payload
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            <div className="p-2.5 rounded bg-[#04060b] border border-white/[0.04] space-y-1">
              <div className="text-theme-muted text-[10px]">Operation</div>
              <div className="text-sky-300 font-semibold truncate">{approval.operation}</div>
            </div>

            <div className="p-2.5 rounded bg-[#04060b] border border-white/[0.04] space-y-1">
              <div className="text-theme-muted text-[10px]">Target Project ID</div>
              <div className="text-theme-secondary font-mono truncate">{approval.projectId}</div>
            </div>

            <div className="p-2.5 rounded bg-[#04060b] border border-white/[0.04] space-y-1">
              <div className="text-theme-muted text-[10px]">Payload Hash (SHA-256)</div>
              <div className="text-theme-secondary truncate">{approval.payloadHash}</div>
            </div>

            <div className="p-2.5 rounded bg-[#04060b] border border-white/[0.04] space-y-1 flex items-center justify-between">
              <div>
                <div className="text-theme-muted text-[10px]">Approval Request ID</div>
                <div className="text-theme-secondary truncate">{approval.id}</div>
              </div>
              <button
                onClick={handleCopyId}
                className="p-1 rounded hover:bg-white/[0.08] text-theme-muted hover:text-theme-primary transition"
                title="Copy ID"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded bg-[#04060b] border border-white/[0.04] space-y-1">
            <div className="text-theme-muted text-[10px]">Summary & Context</div>
            <div className="text-theme-secondary whitespace-pre-wrap">{approval.summary}</div>
          </div>
        </div>
      )}
    </div>
  );
};
