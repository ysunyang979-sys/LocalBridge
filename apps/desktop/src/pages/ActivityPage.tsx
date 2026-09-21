import React, { useState } from "react";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  Search,
  X,
  Terminal,
  FolderLock,
  GitBranch,
  Compass,
} from "lucide-react";
import type { AuditEvent, Approval, UserExperienceMode } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { ApprovalCard } from "../components/ApprovalCard.js";

interface ActivityPageProps {
  events: AuditEvent[];
  approvals?: Approval[];
  onRefresh: () => void;
  onResolveApproval?: (approvalId: string, action: "approve" | "deny") => Promise<void>;
  initialFilter?: ActivityFilterType;
  uxMode?: UserExperienceMode;
}

export type ActivityFilterType =
  | "all"
  | "jobs"
  | "files"
  | "git"
  | "workflow"
  | "approvals"
  | "security";

export const ActivityPage: React.FC<ActivityPageProps> = ({
  events,
  approvals = [],
  onRefresh,
  onResolveApproval,
  initialFilter = "all",
  uxMode = "standard",
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ActivityFilterType>(initialFilter);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleQuickResolve = async (
    approvalId: string,
    action: "approve" | "deny"
  ) => {
    if (!onResolveApproval) return;
    setBusyApprovalId(approvalId);
    try {
      await onResolveApproval(approvalId, action);
      setActionNotice(
        action === "approve"
          ? `${t.activity?.statusApproved || "Approved"}: ${approvalId}`
          : `${t.activity?.statusDenied || "Denied"}: ${approvalId}`
      );
      setTimeout(() => setActionNotice(null), 3500);
      onRefresh();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setBusyApprovalId(null);
    }
  };

  // Filter audit events
  const filteredEvents = events.filter((evt) => {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const matchSearch =
        evt.toolName.toLowerCase().includes(q) ||
        evt.event.toLowerCase().includes(q) ||
        (evt.projectId && evt.projectId.toLowerCase().includes(q)) ||
        (evt.actorDisplayName && evt.actorDisplayName.toLowerCase().includes(q));
      if (!matchSearch) return false;
    }

    if (filter === "all") return true;
    if (filter === "jobs") {
      return (
        evt.toolName.includes("job") ||
        evt.event.includes("job") ||
        evt.toolName.includes("exec")
      );
    }
    if (filter === "files") {
      return (
        evt.toolName.includes("file") ||
        evt.event.includes("file") ||
        evt.toolName.includes("read") ||
        evt.toolName.includes("write")
      );
    }
    if (filter === "git") {
      return (
        evt.toolName.includes("git") ||
        evt.event.includes("git")
      );
    }
    if (filter === "workflow") {
      return (
        evt.toolName.includes("session") ||
        evt.event.includes("session") ||
        evt.event.includes("workflow")
      );
    }
    if (filter === "security") {
      return (
        evt.toolName.includes("trust") ||
        evt.toolName.includes("policy") ||
        evt.toolName.includes("token") ||
        evt.toolName.includes("approval") ||
        evt.event.includes("security") ||
        evt.event.includes("stop") ||
        evt.event.includes("pause")
      );
    }
    if (filter === "approvals") return false; // Handled separately
    return true;
  });

  // Filter approvals
  const filteredApprovals = approvals.filter((app) => {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const matchSearch =
        app.operation.toLowerCase().includes(q) ||
        app.projectId.toLowerCase().includes(q) ||
        app.summary.toLowerCase().includes(q) ||
        app.id.toLowerCase().includes(q) ||
        (app.resolvedBy && app.resolvedBy.toLowerCase().includes(q));
      if (!matchSearch) return false;
    }

    if (filter === "all") return true;
    if (filter === "approvals") return true;
    if (filter === "git" && app.operation.startsWith("git.")) return true;
    if (filter === "files" && app.operation.startsWith("file.")) return true;
    if (filter === "jobs" && app.operation.startsWith("job.")) return true;
    if (filter === "security") return true;
    return false;
  });

  const pendingApprovals = filteredApprovals.filter((a) => a.status === "pending");
  const resolvedApprovals = filteredApprovals.filter((a) => a.status !== "pending");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
            {t.activity?.statusPending || "PENDING"}
          </span>
        );
      case "approved":
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            {t.activity?.statusApproved || "APPROVED"}
          </span>
        );
      case "denied":
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30">
            {t.activity?.statusDenied || "DENIED"}
          </span>
        );
      case "consumed":
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30">
            {t.activity?.statusConsumed || "CONSUMED"}
          </span>
        );
      case "expired":
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/30">
            {t.activity?.statusExpired || "EXPIRED"}
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-500/10 text-slate-400">
            {status}
          </span>
        );
    }
  };

  const allFilterTabs: Array<{ id: ActivityFilterType; label: string; icon: any; advancedOnly?: boolean }> = [
    { id: "all", label: t.activity?.filterAll || "All Activity", icon: FileText },
    { id: "approvals", label: t.activity?.filterApprovals || "Approvals", icon: ShieldAlert },
    { id: "files", label: t.activity?.filterFiles || "Filesystem", icon: FolderLock },
    { id: "jobs", label: t.activity?.filterJobs || "Runtimes & Jobs", icon: Terminal, advancedOnly: true },
    { id: "git", label: t.activity?.filterGit || "Git Ops", icon: GitBranch, advancedOnly: true },
    { id: "workflow", label: t.activity?.filterWorkflow || "Workflows", icon: Compass, advancedOnly: true },
    { id: "security", label: t.activity?.filterSecurity || "Security & Audit", icon: ShieldCheck },
  ];

  const filterTabs = uxMode === "standard"
    ? allFilterTabs.filter((tab) => !tab.advancedOnly)
    : allFilterTabs;

  const showApprovalsSection =
    filter === "all" || filter === "approvals" || filter === "git" || filter === "files";
  const showEventsSection = filter !== "approvals";

  const totalCount =
    filter === "approvals"
      ? filteredApprovals.length
      : filter === "all"
        ? filteredApprovals.length + filteredEvents.length
        : filteredEvents.length + (showApprovalsSection ? filteredApprovals.length : 0);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-theme-primary tracking-tight">
            {t.activity?.title || "Activity & Operations"}
          </h2>
          <p className="text-xs text-theme-muted">
            {t.activity?.subtitle ||
              "Unified chronological record of AI operations, tool executions, runtime lifecycles, and approvals."}
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-medium transition shadow-sm"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>{t.common?.refresh || "Refresh"}</span>
        </button>
      </div>

      {/* Action Toast Feedback */}
      {actionNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 bg-theme-card-muted border border-theme-subtle p-1 rounded-xl overflow-x-auto">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const active = filter === tab.id;
            const pendingCount = approvals.filter((a) => a.status === "pending").length;

            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
                  active
                    ? "bg-theme-card text-theme-primary shadow-sm border border-theme-subtle font-semibold"
                    : "text-theme-muted hover:text-theme-primary"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.id === "approvals" && pendingCount > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-amber-500 text-slate-900 font-bold rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 text-theme-muted absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.activity?.searchPlaceholder || t.common?.search || "Search activity..."}
            className="w-full bg-theme-input border border-theme-input rounded-xl pl-9 pr-3 py-1.5 text-xs text-theme-primary focus:outline-none focus:border-sky-500 transition font-mono"
          />
        </div>
      </div>

      {/* Pinned Pending Approvals (If any exist) */}
      {pendingApprovals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h3 className="text-xs font-mono uppercase tracking-wider text-amber-600 dark:text-amber-300 font-semibold">
              {t.activity?.pendingApprovalsTitle || "Pending Operator Approvals"} ({pendingApprovals.length})
            </h3>
          </div>
          <div className="space-y-2">
            {pendingApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onApprove={(id) => handleQuickResolve(id, "approve")}
                onDeny={(id) => handleQuickResolve(id, "deny")}
                isProcessing={busyApprovalId === approval.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {totalCount === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-subtle rounded-xl space-y-3 shadow-sm">
          <FileText className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">
            {t.activity?.noActivity || "No Activity Recorded"}
          </div>
          <p className="text-theme-muted text-xs">
            {t.activity?.noActivityDesc ||
              "All operations and audit events will appear in this unified chronological timeline."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Resolved Approvals History (when filter is all or approvals) */}
          {showApprovalsSection && resolvedApprovals.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-mono font-semibold text-theme-muted uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                <span>{t.activity?.historyTitle || "Approval History"} ({resolvedApprovals.length})</span>
              </div>

              <div className="space-y-2">
                {resolvedApprovals.map((app) => (
                  <div
                    key={app.id}
                    className="p-3 bg-theme-card border border-theme-subtle rounded-xl flex items-center justify-between gap-4 text-xs font-mono shadow-sm"
                  >
                    <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                      {getStatusBadge(app.status)}
                      <span className="font-semibold text-theme-primary truncate">
                        {app.operation}
                      </span>
                      {app.projectId && (
                        <span className="text-sky-600 dark:text-sky-400 text-[11px]">
                          [{app.projectId}]
                        </span>
                      )}
                      <span className="text-theme-muted truncate max-w-sm">
                        {app.summary}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-theme-muted text-[11px] shrink-0">
                      <span>{new Date(app.createdAt).toLocaleTimeString()}</span>
                      <button
                        onClick={() => setSelectedApproval(app)}
                        className="text-theme-muted hover:text-sky-500 dark:hover:text-sky-400 transition"
                      >
                        {t.activity?.inspect || "Inspect"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit Events Section */}
          {showEventsSection && filteredEvents.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-mono font-semibold text-theme-muted uppercase tracking-wider flex items-center gap-2 pt-2 border-t border-theme-subtle">
                <FileText className="w-3.5 h-3.5 text-sky-500" />
                <span>{t.activity?.auditLogTitle || "Audit & Execution Log"} ({filteredEvents.length})</span>
              </div>

              <div className="space-y-2">
                {filteredEvents.map((evt) => {
                  const isSuccess = evt.resultStatus === "success";
                  const isError =
                    evt.resultStatus === "error" || evt.event.includes("failed");
                  const time = new Date(evt.timestamp).toLocaleTimeString();

                  return (
                    <div
                      key={evt.id}
                      className="p-3 bg-theme-card border border-theme-subtle rounded-xl flex items-center justify-between gap-4 text-xs font-mono shadow-sm"
                    >
                      <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                        {isError ? (
                          <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        ) : isSuccess ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="font-semibold text-theme-primary">
                          {evt.toolName}
                        </span>
                        <span className="text-theme-muted text-[11px] truncate">
                          {evt.event}
                        </span>
                        {evt.projectId && (
                          <span className="text-sky-600 dark:text-sky-400 text-[11px]">
                            [{evt.projectId}]
                          </span>
                        )}
                        {evt.decisionSource && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-theme-card-muted text-theme-muted border border-theme-subtle">
                            {evt.decisionSource}
                          </span>
                        )}
                        {evt.errorCode && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                            {evt.errorCode}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-theme-muted text-[11px] shrink-0">
                        {evt.durationMs !== undefined && (
                          <span>{evt.durationMs}ms</span>
                        )}
                        <span>{time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approval Details Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-theme-card-muted border-b border-theme-subtle flex items-center justify-between">
              <div className="flex items-center gap-2 text-theme-primary font-bold text-sm font-mono">
                <ShieldAlert className="w-4 h-4 text-sky-500" />
                <span>{t.activity?.detailModalTitle || "Approval Specification"}</span>
              </div>
              <button
                onClick={() => setSelectedApproval(null)}
                className="text-theme-muted hover:text-theme-primary p-1 rounded-lg hover:bg-theme-card-hover transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-xs font-mono">
              <div className="p-3 bg-theme-card-muted border border-theme-subtle rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-theme-muted">{t.activity?.operation || "Operation"}</div>
                  <div className="font-bold text-sky-600 dark:text-sky-300">{selectedApproval.operation}</div>
                </div>
                {getStatusBadge(selectedApproval.status)}
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-theme-muted mb-1">
                  {t.activity?.summary || "Summary"}
                </label>
                <div className="p-3 bg-theme-card-muted border border-theme-subtle rounded-lg text-theme-secondary">
                  {selectedApproval.summary}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="p-2.5 bg-theme-card-muted border border-theme-subtle rounded-lg">
                  <span className="text-theme-muted">{t.activity?.project || "Project"}:</span>{" "}
                  <span className="text-theme-primary font-semibold">{selectedApproval.projectId}</span>
                </div>
                <div className="p-2.5 bg-theme-card-muted border border-theme-subtle rounded-lg">
                  <span className="text-theme-muted">{t.activity?.decisionSource || "Decision Source"}:</span>{" "}
                  <span className="text-theme-primary">{selectedApproval.decisionSource || "desktop"}</span>
                </div>
                <div className="p-2.5 bg-theme-card-muted border border-theme-subtle rounded-lg">
                  <span className="text-theme-muted">{t.activity?.createdAt || "Created"}:</span>{" "}
                  <span className="text-theme-primary">{new Date(selectedApproval.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="p-2.5 bg-theme-card-muted border border-theme-subtle rounded-lg">
                  <span className="text-theme-muted">{t.activity?.resolvedBy || "Resolved By"}:</span>{" "}
                  <span className="text-theme-primary">{selectedApproval.resolvedBy || "—"}</span>
                </div>
              </div>

              <div className="p-2.5 bg-theme-card-muted border border-theme-subtle rounded-lg space-y-1">
                <div className="flex items-center justify-between text-theme-muted text-[10px]">
                  <span>{t.activity?.approvalId || "Approval ID"}</span>
                  <button
                    onClick={() => copyToClipboard(selectedApproval.id, "appId")}
                    className="text-sky-500 hover:underline"
                  >
                    {copiedField === "appId" ? (t.common?.copied || "Copied") : (t.common?.copy || "Copy")}
                  </button>
                </div>
                <div className="text-theme-secondary break-all">{selectedApproval.id}</div>
              </div>

              <div className="p-2.5 bg-theme-card-muted border border-theme-subtle rounded-lg space-y-1">
                <div className="flex items-center justify-between text-theme-muted text-[10px]">
                  <span>{t.activity?.payloadHash || "Payload Hash (SHA-256)"}</span>
                  <button
                    onClick={() => copyToClipboard(selectedApproval.payloadHash, "payloadHash")}
                    className="text-sky-500 hover:underline"
                  >
                    {copiedField === "payloadHash" ? (t.common?.copied || "Copied") : (t.common?.copy || "Copy")}
                  </button>
                </div>
                <div className="text-theme-secondary break-all">{selectedApproval.payloadHash}</div>
              </div>
            </div>

            <div className="px-6 py-4 bg-theme-card-muted border-t border-theme-subtle flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedApproval(null)}
                className="px-4 py-2 bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-theme-secondary rounded-lg text-xs font-medium transition shadow-sm"
              >
                {t.common?.close || "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
