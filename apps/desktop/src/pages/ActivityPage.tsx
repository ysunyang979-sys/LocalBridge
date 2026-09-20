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
  Check,
  X,
  Copy,
  Terminal,
  FolderLock,
  GitBranch,
  Eye,
} from "lucide-react";
import type { AuditEvent, Approval } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface ActivityPageProps {
  events: AuditEvent[];
  approvals?: Approval[];
  onRefresh: () => void;
  onResolveApproval?: (approvalId: string, action: "approve" | "deny") => Promise<void>;
  initialFilter?: ActivityFilterType;
}

export type ActivityFilterType =
  | "all"
  | "jobs"
  | "files"
  | "git"
  | "approvals"
  | "security";

export const ActivityPage: React.FC<ActivityPageProps> = ({
  events,
  approvals = [],
  onRefresh,
  onResolveApproval,
  initialFilter = "all",
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
    action: "approve" | "deny",
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    if (!onResolveApproval) return;
    setBusyApprovalId(approvalId);
    try {
      await onResolveApproval(approvalId, action);
      setActionNotice(
        action === "approve"
          ? `${t.activity.statusApproved}: ${approvalId}`
          : `${t.activity.statusDenied}: ${approvalId}`
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <span className="badge badge-amber">{t.activity.statusPending}</span>;
      case "approved":
        return <span className="badge badge-green">{t.activity.statusApproved}</span>;
      case "denied":
        return <span className="badge badge-red">{t.activity.statusDenied}</span>;
      case "consumed":
        return <span className="badge badge-blue">{t.activity.statusConsumed}</span>;
      case "expired":
        return <span className="badge badge-slate">{t.activity.statusExpired}</span>;
      default:
        return <span className="badge badge-slate">{status}</span>;
    }
  };

  const getDecisionSourceBadge = (source?: string | null) => {
    if (!source) return null;
    const isChat = source.toLowerCase().includes("chat");
    return (
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
          isChat
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
            : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
        }`}
      >
        {isChat ? "ChatGPT" : "Desktop"}
      </span>
    );
  };

  const filterTabs: Array<{ id: ActivityFilterType; label: string; icon: any }> = [
    { id: "all", label: t.activity.filterAll, icon: FileText },
    { id: "approvals", label: t.activity.filterApprovals, icon: ShieldAlert },
    { id: "jobs", label: t.activity.filterJobs, icon: Terminal },
    { id: "files", label: t.activity.filterFiles, icon: FolderLock },
    { id: "git", label: t.activity.filterGit, icon: GitBranch },
    { id: "security", label: t.activity.filterSecurity, icon: ShieldCheck },
  ];

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
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-theme-primary">{t.activity.title}</h2>
          <p className="text-xs text-theme-muted">{t.activity.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-medium transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>{t.common.refresh}</span>
          </button>
        </div>
      </div>

      {/* Action Toast Feedback */}
      {actionNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 bg-theme-card-muted border border-theme-subtle p-1 rounded-lg overflow-x-auto">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition shrink-0 ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-theme-muted hover:text-theme-primary"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.id === "approvals" && approvals.filter((a) => a.status === "pending").length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-theme-muted absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.common.search}
            className="w-full bg-theme-input border border-theme-input rounded-lg pl-9 pr-3 py-1.5 text-xs text-theme-primary focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

      {/* Empty State */}
      {totalCount === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
          <FileText className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">{t.activity.noActivity}</div>
          <p className="text-theme-muted text-xs">{t.activity.noActivityDesc}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Approvals Section (When relevant) */}
          {showApprovalsSection && filteredApprovals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-theme-muted uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  <span>
                    {t.activity.filterApprovals} ({filteredApprovals.length})
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                {filteredApprovals.map((app) => {
                  const isPending = app.status === "pending";
                  const isDangerous = app.risk === "DANGEROUS";
                  const isBusy = busyApprovalId === app.id;

                  return (
                    <div
                      key={app.id}
                      className={`p-4 bg-theme-card border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm transition ${
                        isPending
                          ? "border-amber-500/40 bg-amber-500/[0.03]"
                          : "border-theme-card hover:border-theme-subtle"
                      }`}
                    >
                      {/* Left info */}
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusBadge(app.status)}
                          <span
                            className={`badge ${
                              isDangerous ? "badge-red" : "badge-amber"
                            }`}
                          >
                            {app.risk}
                          </span>
                          <span className="font-mono text-xs font-bold text-theme-primary">
                            {app.operation}
                          </span>
                          {app.projectId && (
                            <span className="text-xs text-indigo-500 font-mono">
                              [{app.projectId}]
                            </span>
                          )}
                          {getDecisionSourceBadge(app.decisionSource)}
                        </div>

                        {/* Clean summary without raw hashes */}
                        <p className="text-xs text-theme-secondary font-medium line-clamp-2">
                          {app.summary}
                        </p>

                        <div className="flex items-center gap-4 text-[11px] text-theme-muted font-mono flex-wrap">
                          <span>
                            {t.activity.createdAt}: {new Date(app.createdAt).toLocaleTimeString()}
                          </span>
                          {app.resolvedBy && (
                            <span>
                              {t.activity.resolvedBy}: {app.resolvedBy}
                            </span>
                          )}
                          {isPending && (
                            <span className="text-amber-500">
                              {t.activity.expiresAt}: {new Date(app.expiresAt).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right actions */}
                      <div className="shrink-0 flex items-center gap-2 self-end md:self-center">
                        {/* Inline Quick Approve / Deny for Pending Items */}
                        {isPending && onResolveApproval && (
                          <div className="flex items-center gap-1.5 mr-1">
                            <button
                              disabled={isBusy}
                              onClick={(e) => handleQuickResolve(app.id, "approve", e)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{t.activity.quickApprove}</span>
                            </button>
                            <button
                              disabled={isBusy}
                              onClick={(e) => handleQuickResolve(app.id, "deny", e)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-600/15 hover:bg-red-600/25 text-red-500 border border-red-500/30 disabled:opacity-50 rounded-lg text-xs font-semibold transition"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>{t.activity.quickDeny}</span>
                            </button>
                          </div>
                        )}

                        {/* View Technical Details Drawer/Modal Trigger */}
                        <button
                          onClick={() => setSelectedApproval(app)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-medium transition"
                        >
                          <Eye className="w-3.5 h-3.5 text-theme-muted" />
                          <span>{t.activity.viewDetails}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audit Events Section */}
          {showEventsSection && filteredEvents.length > 0 && (
            <div className="space-y-3">
              {showApprovalsSection && filteredApprovals.length > 0 && (
                <div className="text-xs font-semibold text-theme-muted uppercase tracking-wider flex items-center gap-2 pt-2 border-t border-theme-subtle">
                  <FileText className="w-4 h-4 text-indigo-500" />
                  <span>
                    {t.activity.filterSecurity} ({filteredEvents.length})
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {filteredEvents.map((evt) => {
                  const isSuccess = evt.resultStatus === "success";
                  const isError =
                    evt.resultStatus === "error" || evt.event.includes("failed");
                  const time = new Date(evt.timestamp).toLocaleTimeString();

                  return (
                    <div
                      key={evt.id}
                      className="p-3 bg-theme-card border border-theme-card rounded-lg flex items-center justify-between gap-4 text-xs font-mono shadow-sm"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        {isError ? (
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                        ) : isSuccess ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-theme-muted shrink-0" />
                        )}
                        <span className="font-semibold text-theme-primary">
                          {evt.toolName}
                        </span>
                        <span className="text-theme-muted text-[11px]">{evt.event}</span>
                        {evt.projectId && (
                          <span className="text-indigo-500 text-[11px]">
                            [{evt.projectId}]
                          </span>
                        )}
                        {evt.decisionSource && (
                          <span className="badge badge-blue text-[10px]">
                            {t.activity.decisionSourceLabel}: {evt.decisionSource}
                          </span>
                        )}
                        {evt.actorDisplayName && (
                          <span className="text-theme-secondary text-[11px]">
                            {t.activity.operatorLabel}: {evt.actorDisplayName}
                          </span>
                        )}
                        {evt.errorCode && (
                          <span className="badge badge-red text-[10px]">{evt.errorCode}</span>
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

      {/* Technical Evidence / Approval Details Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-theme-card-muted border-b border-theme-subtle flex items-center justify-between">
              <div className="flex items-center gap-2 text-theme-primary font-bold text-sm">
                <ShieldAlert className="w-4 h-4 text-indigo-500" />
                <span>{t.activity.detailModalTitle}</span>
              </div>
              <button
                onClick={() => setSelectedApproval(null)}
                className="text-theme-muted hover:text-theme-primary p-1 rounded-lg hover:bg-theme-card transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto text-xs">
              {/* Status and Operation */}
              <div className="flex items-center justify-between p-3 bg-theme-card-muted border border-theme-subtle rounded-lg">
                <div>
                  <div className="text-[11px] text-theme-muted">{t.activity.operation}</div>
                  <div className="font-mono font-bold text-sm text-theme-primary">
                    {selectedApproval.operation}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedApproval.status)}
                  <span
                    className={`badge ${
                      selectedApproval.risk === "DANGEROUS" ? "badge-red" : "badge-amber"
                    }`}
                  >
                    {selectedApproval.risk}
                  </span>
                </div>
              </div>

              {/* Summary */}
              <div>
                <label className="block text-[11px] font-semibold text-theme-muted uppercase mb-1">
                  {t.activity.summary}
                </label>
                <div className="p-3 bg-theme-input border border-theme-subtle rounded-lg text-theme-secondary">
                  {selectedApproval.summary}
                </div>
              </div>

              {/* Basic metadata grid */}
              <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                <div className="p-2.5 bg-theme-card-muted border border-theme-subtle rounded-lg">
                  <span className="text-theme-muted">{t.activity.project}:</span>{" "}
                  <span className="text-theme-primary font-semibold">
                    {selectedApproval.projectId}
                  </span>
                </div>
                <div className="p-2.5 bg-theme-card-muted border border-theme-subtle rounded-lg">
                  <span className="text-theme-muted">{t.activity.decisionSource}:</span>{" "}
                  <span className="text-theme-primary">
                    {selectedApproval.decisionSource || "desktop"}
                  </span>
                </div>
                <div className="p-2.5 bg-theme-card-muted border border-theme-subtle rounded-lg">
                  <span className="text-theme-muted">{t.activity.createdAt}:</span>{" "}
                  <span className="text-theme-primary">
                    {new Date(selectedApproval.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="p-2.5 bg-theme-card-muted border border-theme-subtle rounded-lg">
                  <span className="text-theme-muted">
                    {selectedApproval.resolvedAt
                      ? t.activity.resolvedAt
                      : t.activity.expiresAt}
                    :
                  </span>{" "}
                  <span className="text-theme-primary">
                    {selectedApproval.resolvedAt
                      ? new Date(selectedApproval.resolvedAt).toLocaleString()
                      : new Date(selectedApproval.expiresAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Technical Signatures & IDs */}
              <div className="space-y-3 pt-2 border-t border-theme-subtle">
                <div className="text-[11px] font-semibold text-theme-muted uppercase">
                  {t.activity.technicalMetadata}
                </div>

                {/* Approval ID */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-theme-muted">
                    <span>{t.activity.approvalId}</span>
                    <button
                      onClick={() => copyToClipboard(selectedApproval.id, "appId")}
                      className="flex items-center gap-1 text-indigo-500 hover:text-indigo-400 font-sans"
                    >
                      {copiedField === "appId" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span>{t.common.copied}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t.common.copy}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-2 bg-theme-input border border-theme-subtle rounded font-mono text-[11px] text-theme-primary break-all select-all">
                    {selectedApproval.id}
                  </div>
                </div>

                {/* Payload Hash */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-theme-muted">
                    <span>{t.activity.payloadHash}</span>
                    <button
                      onClick={() =>
                        copyToClipboard(selectedApproval.payloadHash, "payloadHash")
                      }
                      className="flex items-center gap-1 text-indigo-500 hover:text-indigo-400 font-sans"
                    >
                      {copiedField === "payloadHash" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span>{t.common.copied}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t.common.copy}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-2 bg-theme-input border border-theme-subtle rounded font-mono text-[11px] text-theme-primary break-all select-all">
                    {selectedApproval.payloadHash}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-theme-card-muted border-t border-theme-subtle flex items-center justify-between">
              {selectedApproval.status === "pending" && onResolveApproval ? (
                <div className="flex items-center gap-2">
                  <button
                    disabled={busyApprovalId === selectedApproval.id}
                    onClick={async () => {
                      await handleQuickResolve(selectedApproval.id, "approve");
                      setSelectedApproval(null);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{t.activity.quickApprove}</span>
                  </button>
                  <button
                    disabled={busyApprovalId === selectedApproval.id}
                    onClick={async () => {
                      await handleQuickResolve(selectedApproval.id, "deny");
                      setSelectedApproval(null);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{t.activity.quickDeny}</span>
                  </button>
                </div>
              ) : (
                <span className="text-xs text-theme-muted">
                  {selectedApproval.resolvedBy
                    ? `${t.activity.resolvedBy}: ${selectedApproval.resolvedBy}`
                    : ""}
                </span>
              )}

              <button
                type="button"
                onClick={() => setSelectedApproval(null)}
                className="px-4 py-2 bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-theme-secondary rounded-lg text-xs font-medium transition ml-auto"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
