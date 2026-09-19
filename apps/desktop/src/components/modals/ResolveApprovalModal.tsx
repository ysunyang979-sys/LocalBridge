import React, { useState, useEffect } from "react";
import { X, ShieldAlert, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import type { Approval } from "../../types.js";
import { bridge } from "../../api/bridge.js";

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
      setError(err.message || `Failed to ${action} approval`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-slate-100">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <span>Human Approval Request</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Status & Expiry Bar */}
          <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2">
              <span
                className={`badge ${
                  approval.risk === "DANGEROUS" ? "badge-red" : "badge-amber"
                }`}
              >
                {approval.risk}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {approval.operation}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="w-4 h-4 text-slate-400" />
              {isExpired ? (
                <span className="text-red-400 font-semibold">EXPIRED</span>
              ) : (
                <span className="text-slate-300 font-mono">
                  {formatSeconds(timeLeft)} remaining
                </span>
              )}
            </div>
          </div>

          {/* Summary Box */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Operation Summary
            </label>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 font-medium">
              {approval.summary}
            </div>
          </div>

          {/* Details & Hashes */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Request ID</span>
              <span className="font-mono text-slate-300 select-all">{approval.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Project ID</span>
              <span className="font-mono text-slate-300">{approval.projectId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Payload SHA-256 Hash</span>
              <span className="font-mono text-indigo-300 text-[11px] truncate max-w-[280px]" title={approval.payloadHash}>
                {approval.payloadHash}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed italic">
            * Parameter binding ensures this approval is cryptographically tied to the exact command arguments and expires after one use.
          </p>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              disabled={loading || isExpired}
              onClick={() => handleResolve("deny")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-red-300 border border-slate-700 disabled:opacity-40 transition"
            >
              <XCircle className="w-4 h-4 text-red-400" />
              <span>Deny</span>
            </button>
            <button
              type="button"
              disabled={loading || isExpired}
              onClick={() => handleResolve("approve")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40 disabled:opacity-40 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve One-Time Execution</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
