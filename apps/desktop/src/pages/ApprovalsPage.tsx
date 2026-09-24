import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  RotateCw,
  CheckCircle2,
  XCircle,
  CheckSquare,
  Square,
  Zap,
  KeyRound,
} from "lucide-react";
import type { Approval, OAuthPendingRequest } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { bridge } from "../api/bridge.js";

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [oauthRequests, setOauthRequests] = useState<OAuthPendingRequest[]>([]);
  const [pairingInputs, setPairingInputs] = useState<Record<string, string>>({});
  const [pairingErrors, setPairingErrors] = useState<Record<string, string>>({});

  const loadOAuthRequests = useCallback(async () => {
    try {
      const res = await bridge.listOAuthRequests();
      setOauthRequests(res.requests || []);
    } catch {
      // Ignore in background
    }
  }, []);

  useEffect(() => {
    loadOAuthRequests();
  }, [loadOAuthRequests]);

  const handleRefreshAll = () => {
    loadOAuthRequests();
    onRefresh();
  };

  const handleResolveOAuth = async (
    requestId: string,
    action: "approve" | "deny"
  ) => {
    const code = (pairingInputs[requestId] || "").trim();
    if (action === "approve" && code.length !== 6) {
      setPairingErrors((prev) => ({
        ...prev,
        [requestId]: "请输入 6 位配对码",
      }));
      return;
    }
    setBusy(true);
    try {
      await bridge.resolveOAuthRequest(
        requestId,
        action,
        action === "approve" ? code : undefined
      );
      setNotice(action === "approve" ? "已批准客户端授权" : "已拒绝客户端授权");
      setTimeout(() => setNotice(null), 4000);
      setPairingErrors((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      loadOAuthRequests();
      onRefresh();
    } catch (err: any) {
      setPairingErrors((prev) => ({
        ...prev,
        [requestId]: err.message || "审批处理失败",
      }));
      loadOAuthRequests();
    } finally {
      setBusy(false);
    }
  };

  const filtered = approvals.filter((a) => {
    if (filter === "all") return true;
    return a.status === filter;
  });

  const pendingApprovals = filtered.filter((a) => a.status === "pending");

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingApprovals.length && pendingApprovals.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingApprovals.map((a) => a.id)));
    }
  };

  const handleBulkResolve = async (action: "approve" | "deny") => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      await bridge.bulkResolveApprovals(Array.from(selectedIds), action);
      setSelectedIds(new Set());
      onRefresh();
    } catch (err: any) {
      alert(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGrantSessionTrust = async (
    projectId: string,
    approvalId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await bridge.grantProjectSessionTrust(projectId);
      await bridge.resolveApproval(approvalId, "approve");
      setNotice(t.approvals.sessionTrustGrantedNotice);
      setTimeout(() => setNotice(null), 4000);
      onRefresh();
    } catch (err: any) {
      alert(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

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
            onClick={handleRefreshAll}
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
                onClick={() => {
                  setFilter(f.id);
                  setSelectedIds(new Set());
                }}
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

      {/* Notice Toast */}
      {notice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* OAuth Client Pending Approvals */}
      {(filter === "all" || filter === "pending") &&
        oauthRequests.filter((r) => r.status === "pending").length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <h3 className="text-xs font-mono uppercase tracking-wider text-amber-600 dark:text-amber-300 font-semibold">
                未验证的动态注册客户端 (
                {oauthRequests.filter((r) => r.status === "pending").length})
              </h3>
            </div>
            <div className="space-y-3">
              {oauthRequests
                .filter((r) => r.status === "pending")
                .map((req) => {
                  const clientName =
                    req.client_name || req.clientName || "Unknown Client";
                  const redirectHost =
                    req.redirect_host || req.redirect_uri_host || "unknown";
                  const currentCode = pairingInputs[req.id] || "";
                  const currentErr = pairingErrors[req.id];
                  const canApprove = currentCode.trim().length === 6 && !busy;
                  const createdAtStr = new Date(
                    req.created_at || req.createdAt || Date.now()
                  ).toLocaleTimeString();

                  return (
                    <div
                      key={req.id}
                      className="p-4 bg-amber-500/[0.04] border border-amber-500/40 rounded-xl shadow-sm space-y-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="badge badge-amber font-semibold">
                              未验证的动态注册客户端
                            </span>
                            <span className="text-xs font-mono font-semibold text-theme-primary">
                              {clientName}
                            </span>
                            <span className="text-xs font-mono text-theme-muted">
                              {req.id}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-theme-secondary">
                            <span>
                              回调域名:{" "}
                              <strong className="font-mono text-theme-primary">
                                {redirectHost}
                              </strong>
                            </span>
                            <span className="text-theme-muted">
                              请求时间: {createdAtStr}
                            </span>
                          </div>

                          <p className="text-xs text-theme-muted">
                            该客户端发起 OAuth 授权请求。请在下方输入浏览器授权页显示的 6 位配对码完成审批。输错 3 次自动拒绝并作废。
                          </p>
                        </div>
                      </div>

                      {currentErr && (
                        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-600 dark:text-red-400 text-xs flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{currentErr}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-theme-subtle">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-theme-muted shrink-0" />
                          <input
                            type="text"
                            maxLength={6}
                            value={currentCode}
                            onChange={(e) => {
                              const val = e.target.value
                                .replace(/\D/g, "")
                                .slice(0, 6);
                              setPairingInputs((prev) => ({
                                ...prev,
                                [req.id]: val,
                              }));
                              if (pairingErrors[req.id]) {
                                setPairingErrors((prev) => {
                                  const next = { ...prev };
                                  delete next[req.id];
                                  return next;
                                });
                              }
                            }}
                            placeholder="输入 6 位配对码"
                            className="w-36 px-2.5 py-1.5 text-center text-xs font-mono tracking-widest bg-theme-input border border-theme-input rounded-lg focus:outline-none focus:border-amber-500 text-theme-primary placeholder:text-theme-muted placeholder:tracking-normal"
                          />
                          <span className="text-[11px] text-theme-muted font-mono">
                            {currentCode.length}/6 位
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!canApprove}
                            onClick={() => handleResolveOAuth(req.id, "approve")}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-sm transition"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>批准</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleResolveOAuth(req.id, "deny")}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>拒绝</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

      {/* Bulk Action Bar */}
      {pendingApprovals.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-theme-card border border-theme-card rounded-xl shadow-sm">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-xs text-theme-secondary hover:text-theme-primary font-medium transition"
          >
            {selectedIds.size > 0 && selectedIds.size === pendingApprovals.length ? (
              <CheckSquare className="w-4 h-4 text-indigo-600" />
            ) : (
              <Square className="w-4 h-4 text-theme-muted" />
            )}
            <span>
              {selectedIds.size > 0
                ? t.approvals.bulkSelectedCount.replace("{count}", String(selectedIds.size))
                : t.common.all}
            </span>
          </button>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                disabled={busy}
                onClick={() => handleBulkResolve("approve")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t.approvals.bulkApproveBtn}</span>
              </button>
              <button
                disabled={busy}
                onClick={() => handleBulkResolve("deny")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>{t.approvals.bulkDenyBtn}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Approvals List */}
      {filtered.length === 0 &&
      oauthRequests.filter((r) => r.status === "pending").length === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
          <ShieldAlert className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">{t.approvals.noApprovals}</div>
          <p className="text-theme-muted text-xs">{t.approvals.noApprovalsDesc}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((approval) => {
            const isPending = approval.status === "pending";
            const isDangerous = approval.risk === "DANGEROUS";
            const expiresDate = new Date(approval.expiresAt);
            const isSelected = selectedIds.has(approval.id);

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
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {isPending && (
                    <button
                      onClick={(e) => toggleSelect(approval.id, e)}
                      className="mt-0.5 text-theme-muted hover:text-indigo-600 transition shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  )}

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
                      <span>
                        {t.approvals.project}: {approval.projectId}
                      </span>
                      <span>Hash: {approval.payloadHash.substring(0, 16)}...</span>
                      <span>
                        {isPending
                          ? `${t.approvals.expiresIn}: ${expiresDate.toLocaleTimeString()}`
                          : `${t.approvals.createdAt}: ${new Date(approval.createdAt).toLocaleTimeString()}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isPending && approval.operation === "file.delete" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) =>
                        handleGrantSessionTrust(approval.projectId, approval.id, e)
                      }
                      title={t.approvals.grantSessionTrustForProject}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-lg text-[11px] font-medium transition"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{t.approvals.grantSessionTrustForProject}</span>
                    </button>
                  )}

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
                      {approval.resolvedBy
                        ? `${t.approvals.resolvedBy}: ${approval.resolvedBy}`
                        : t.jobs.completed}
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
