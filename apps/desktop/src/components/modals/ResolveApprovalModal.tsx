import React, { useState, useEffect } from "react";
import { X, ShieldAlert, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import type { Approval } from "../../types.js";
import { bridge } from "../../api/bridge.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface ResolveApprovalModalProps {
  approval: Approval | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ResolveApprovalModal: React.FC<ResolveApprovalModalProps> = ({
  approval,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t, translateError } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!approval) return;
    const calculateTime = () => {
      const remaining = Math.max(0, Math.floor((approval.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [approval]);

  if (!isOpen || !approval) return null;

  const isExpired = timeLeft <= 0 && approval.status === "pending";

  const handleResolve = async (action: "approve" | "deny") => {
    setLoading(true);
    setError(null);
    try {
      await bridge.resolveApproval(approval.id, action);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setLoading(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-theme-card border border-theme-card rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-theme-primary">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <span>{t.approvals.requestDetails}</span>
          </div>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-primary p-1 rounded-lg hover:bg-theme-card-hover transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-500 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Status & Expiry Bar */}
          <div className="flex items-center justify-between p-3 bg-theme-card-muted rounded-lg border border-theme-subtle">
            <div className="flex items-center gap-2">
              <span
                className={`badge ${
                  approval.risk === "DANGEROUS" ? "badge-red" : "badge-amber"
                }`}
              >
                {approval.risk}
              </span>
              <span className="text-xs text-theme-muted font-mono">
                {approval.operation}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="w-4 h-4 text-theme-muted" />
              {isExpired ? (
                <span className="text-red-500 font-semibold">{t.approvals.expired}</span>
              ) : (
                <span className="text-theme-primary font-mono">
                  {formatSeconds(timeLeft)}
                </span>
              )}
            </div>
          </div>

          {/* Summary Box */}
          <div>
            <label className="block text-xs font-medium text-theme-secondary mb-1">
              {t.approvals.operation}
            </label>
            <div className="p-3 bg-theme-card-muted border border-theme-subtle rounded-lg text-sm text-theme-primary font-medium">
              {approval.summary}
            </div>
          </div>

          {/* Details & Hashes */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-theme-subtle">
              <span className="text-theme-muted">Request ID</span>
              <span className="font-mono text-theme-primary select-all">{approval.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-theme-subtle">
              <span className="text-theme-muted">{t.approvals.project}</span>
              <span className="font-mono text-theme-primary">{approval.projectId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-theme-subtle">
              <span className="text-theme-muted">{t.approvals.payloadHash}</span>
              <span className="font-mono text-indigo-500 text-[11px] truncate max-w-[280px]" title={approval.payloadHash}>
                {approval.payloadHash}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-theme-muted leading-relaxed italic">
            * {t.approvals.autoExpiresNotice}
          </p>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-theme-subtle flex justify-end gap-3">
            <button
              type="button"
              disabled={loading || isExpired}
              onClick={() => handleResolve("deny")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-theme-card-muted hover:bg-theme-card-hover text-red-500 border border-theme-subtle disabled:opacity-40 transition"
            >
              <XCircle className="w-4 h-4 text-red-500" />
              <span>{t.approvals.denyBtn}</span>
            </button>
            <button
              type="button"
              disabled={loading || isExpired}
              onClick={() => handleResolve("approve")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-40 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t.approvals.approveBtn}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
