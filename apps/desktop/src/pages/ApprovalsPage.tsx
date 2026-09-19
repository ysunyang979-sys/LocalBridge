import React, { useState } from "react";
import { ShieldAlert, RotateCw } from "lucide-react";
import type { Approval } from "../types.js";

interface ApprovalsPageProps {
  approvals: Approval[];
  onSelectApproval: (approval: Approval) => void;
  onRefresh: () => void;
}

export const ApprovalsPage: React.FC<ApprovalsPageProps> = ({
  approvals,
  onSelectApproval,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<string>("all");

  const filtered = approvals.filter((a) => {
    if (filter === "all") return true;
    return a.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <span className="badge badge-amber">PENDING</span>;
      case "approved":
        return <span className="badge badge-green">APPROVED</span>;
      case "denied":
        return <span className="badge badge-red">DENIED</span>;
      case "expired":
        return <span className="badge badge-gray">EXPIRED</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Human Approval Center</h2>
          <p className="text-xs text-slate-400">
            Review and grant one-time execution approval for caution and dangerous operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          {/* Filters */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-lg">
          {["all", "pending", "approved", "denied", "expired"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs font-medium capitalize transition ${
                filter === f
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </div>

      {/* Approvals List */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="text-slate-300 font-semibold text-sm">No Approvals in View</div>
          <p className="text-slate-500 text-xs">
            {filter === "pending"
              ? "All pending operations have been resolved or expired."
              : "No approval requests match the current filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((approval) => {
            const isPending = approval.status === "pending";
            const isDangerous = approval.risk === "DANGEROUS";
            const expiresDate = new Date(approval.expiresAt);

            return (
              <div
                key={approval.id}
                onClick={() => onSelectApproval(approval)}
                className={`p-4 bg-slate-900 border rounded-xl hover:border-slate-700 cursor-pointer transition flex items-center justify-between gap-4 ${
                  isPending ? "border-amber-500/30 bg-amber-500/[0.02]" : "border-slate-800"
                }`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(approval.status)}
                    <span
                      className={`badge ${
                        isDangerous ? "badge-red" : "badge-amber"
                      }`}
                    >
                      {approval.risk}
                    </span>
                    <span className="text-xs font-mono font-semibold text-slate-200">
                      {approval.operation}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      {approval.id}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 font-medium truncate">
                    {approval.summary}
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono">
                    <span>Project: {approval.projectId}</span>
                    <span>Hash: {approval.payloadHash.substring(0, 16)}...</span>
                    <span>
                      {isPending
                        ? `Expires: ${expiresDate.toLocaleTimeString()}`
                        : `Created: ${new Date(approval.createdAt).toLocaleTimeString()}`}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isPending ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectApproval(approval);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
                    >
                      Review & Resolve
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {approval.resolvedBy ? `By ${approval.resolvedBy}` : "Completed"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
