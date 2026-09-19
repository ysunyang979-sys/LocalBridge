import React, { useState } from "react";
import { ShieldAlert, RotateCw } from "lucide-react";
import type { Approval } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

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
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string>("all");

  const filtered = approvals.filter((a) => {
    if (filter === "all") return true;
    return a.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <span className="badge badge-amber">{t.common.pending}</span>;
      case "approved":
        return <span className="badge badge-green">{t.common.approved}</span>;
      case "denied":
        return <span className="badge badge-red">{t.common.denied}</span>;
      case "expired":
        return <span className="badge badge-amber">{t.approvals.expired}</span>;
      default:
        return <span className="badge badge-blue">{status}</span>;
    }
  };

  const filterOptions = [
    { id: "all", label: t.common.all },
    { id: "pending", label: t.common.pending },
    { id: "approved", label: t.common.approved },
    { id: "denied", label: t.common.denied },
    { id: "expired", label: t.approvals.expired },
  ];

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-theme-primary">{t.approvals.title}</h2>
          <p className="text-xs text-theme-muted">{t.approvals.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-medium transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>{t.common.refresh}</span>
          </button>

          {/* Filters */}
          <div className="flex items-center gap-1 bg-theme-card-muted border border-theme-subtle p-1 rounded-lg">
            {filterOptions.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  filter === f.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-theme-muted hover:text-theme-primary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Approvals List */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
          <ShieldAlert className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">{t.approvals.noApprovals}</div>
          <p className="text-theme-muted text-xs">
            {filter === "pending"
              ? t.approvals.noApprovalsDesc
              : t.approvals.noApprovalsDesc}
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
                className={`p-4 bg-theme-card border rounded-xl hover:border-indigo-500/50 cursor-pointer transition flex items-center justify-between gap-4 shadow-sm ${
                  isPending
                    ? "border-amber-500/40 bg-amber-500/[0.03]"
                    : "border-theme-card"
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
                    <span className="text-xs font-mono font-semibold text-theme-primary">
                      {approval.operation}
                    </span>
                    <span className="text-xs font-mono text-theme-muted">
                      {approval.id}
                    </span>
                  </div>

                  <p className="text-xs text-theme-secondary font-medium truncate">
                    {approval.summary}
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-theme-muted font-mono">
                    <span>{t.approvals.project}: {approval.projectId}</span>
                    <span>Hash: {approval.payloadHash.substring(0, 16)}...</span>
                    <span>
                      {isPending
                        ? `${t.approvals.expiresIn}: ${expiresDate.toLocaleTimeString()}`
                        : `${t.approvals.createdAt}: ${new Date(approval.createdAt).toLocaleTimeString()}`}
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
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                    >
                      {t.common.details}
                    </button>
                  ) : (
                    <span className="text-xs text-theme-muted">
                      {approval.resolvedBy ? `${t.approvals.resolvedBy} ${approval.resolvedBy}` : t.jobs.completed}
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
