import {
  FolderLock,
  ShieldAlert,
  Radio,
  Server,
  Plus,
  KeyRound,
  OctagonAlert,
  CheckCircle2,
  Clock,
  ArrowRight,
  Globe,
  Compass,
} from "lucide-react";
import type { ServerStatus, McpStatus, Project, Approval, Job } from "../types.js";
import type { NavPage } from "../components/Sidebar.js";
import type { TunnelStatusDto } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface OverviewPageProps {
  serverStatus: ServerStatus | null;
  mcpStatus: McpStatus | null;
  tunnelStatus: TunnelStatusDto | null;
  projects: Project[];
  approvals: Approval[];
  jobs: Job[];
  activeSessionsCount?: number;
  onNavigate: (page: NavPage) => void;
  onOpenAuthorizeModal: () => void;
  onOpenCreateTokenModal: () => void;
  onOpenEmergencyStopModal: () => void;
  onSelectApproval: (approval: Approval) => void;
  onQuickResolveApproval?: (approvalId: string, action: "approve" | "deny") => Promise<void>;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  serverStatus,
  mcpStatus,
  tunnelStatus,
  projects,
  approvals,
  jobs,
  activeSessionsCount = 0,
  onNavigate,
  onOpenAuthorizeModal,
  onOpenCreateTokenModal,
  onOpenEmergencyStopModal,
  onSelectApproval,
  onQuickResolveApproval,
}) => {
  const { t } = useTranslation();
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const activeJobs = jobs.filter((j) => j.state === "running" || j.state === "queued");

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top Banner Alert if Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-amber-500">
                {pendingApprovals.length} {t.overview.pendingFallbackTitle}
              </div>
              <div className="text-xs text-amber-600/80 dark:text-amber-200/70">
                {t.overview.pendingFallbackDesc}
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate("activity")}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs transition shadow-sm"
          >
            {t.overview.viewInActivity}
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Server */}
        <div className="p-5 bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-theme-muted font-medium uppercase tracking-wider">
              {t.overview.localServerCard}
            </span>
            <Server className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-theme-primary">
              {serverStatus ? t.common.online : t.common.loading}
            </div>
            <div className="text-xs text-theme-muted mt-1">
              v{serverStatus?.version || "1.2.0-P0"} &bull; {t.status.loopbackAddr}
            </div>
          </div>
        </div>

        {/* Card 2: AI / MCP Channel */}
        <div className="p-5 bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-theme-muted font-medium uppercase tracking-wider">
              {t.overview.aiAccessCard}
            </span>
            <Radio className="w-4 h-4 text-cyan-500" />
          </div>
          <div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  mcpStatus?.paused
                    ? "bg-amber-500"
                    : mcpStatus?.mcpActive
                      ? "bg-emerald-500"
                      : "bg-red-500"
                }`}
              />
              <span className={mcpStatus?.paused ? "text-amber-500" : "text-theme-primary"}>
                {mcpStatus?.paused
                  ? t.common.paused
                  : mcpStatus?.mcpActive
                    ? t.common.active
                    : t.common.down}
              </span>
            </div>
            <div className="text-xs text-theme-muted mt-1">
              {mcpStatus?.toolsCount ?? 87} safe tools &bull; MCP {mcpStatus?.protocolVersion || "2026-07-28"}
            </div>
          </div>
        </div>

        {/* Card 3: Secure MCP Tunnel */}
        <div
          onClick={() => onNavigate("settings")}
          className="p-5 bg-theme-card border border-theme-card hover:border-indigo-500/50 rounded-xl space-y-3 cursor-pointer transition shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-theme-muted font-medium uppercase tracking-wider">
              {t.overview.secureTunnelCard}
            </span>
            <Globe className="w-4 h-4 text-sky-500" />
          </div>
          <div>
            <div className="text-xl font-bold flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full shrink-0 ${
                  tunnelStatus?.status === "Connected" && tunnelStatus?.configured
                    ? "bg-emerald-500"
                    : tunnelStatus?.status === "Reconnecting"
                      ? "bg-amber-500"
                      : tunnelStatus?.status === "Connecting" || tunnelStatus?.status === "Starting"
                        ? "bg-blue-500"
                        : tunnelStatus?.status === "AuthenticationError" ||
                          tunnelStatus?.status === "NeedsAttention" ||
                          tunnelStatus?.status === "Error" ||
                          tunnelStatus?.status === "RuntimeMissing" ||
                          tunnelStatus?.status === "HealthPortConflict" ||
                          tunnelStatus?.status === "LocalMcpUnavailable"
                          ? "bg-red-500"
                          : "bg-slate-400"
                }`}
              />
              <span className="text-base font-bold truncate text-theme-primary">
                {tunnelStatus?.status === "Connected" && tunnelStatus?.configured
                  ? t.overview.chatGptReady
                  : tunnelStatus?.status === "Reconnecting"
                    ? t.tunnel.statusReconnecting
                    : tunnelStatus?.status === "Starting"
                      ? t.tunnel.statusStarting
                      : tunnelStatus?.status === "Connecting"
                        ? t.tunnel.statusConnecting
                        : tunnelStatus?.status === "AuthenticationError"
                          ? t.tunnel.statusAuthError
                          : tunnelStatus?.status === "NeedsAttention"
                            ? t.tunnel.statusNeedsAttention
                            : tunnelStatus?.status === "RuntimeMissing"
                              ? t.tunnel.statusMissingRuntime
                              : tunnelStatus?.status === "HealthPortConflict"
                                ? t.tunnel.statusPortConflict
                                : tunnelStatus?.status === "LocalMcpUnavailable"
                                  ? t.tunnel.statusMcpUnavailable
                                  : tunnelStatus?.status === "Stopped"
                                    ? t.tunnel.statusStopped
                                    : t.tunnel.statusNotConfigured}
              </span>
            </div>
            <div className="text-xs text-theme-muted mt-1 truncate">
              <span>
                {tunnelStatus?.network_mode === "direct"
                  ? t.tunnel.modeDirect
                  : tunnelStatus?.network_mode === "custom"
                    ? t.tunnel.modeCustom
                    : t.tunnel.modeSystem}
              </span>
              {" · "}
              <span className={(tunnelStatus?.control_plane_status === "Connected" || tunnelStatus?.control_plane_connected) ? "text-emerald-500" : ""}>
                CP: {(tunnelStatus?.control_plane_status === "Connected" || tunnelStatus?.control_plane_connected)
                  ? t.tunnel.controlPlaneConnected
                  : (tunnelStatus?.status === "Connecting" || tunnelStatus?.status === "Starting" || tunnelStatus?.control_plane_status === "Polling")
                    ? t.tunnel.controlPlanePolling
                    : t.tunnel.controlPlaneFailed}
              </span>
              {" · "}
              <span className={(tunnelStatus?.local_mcp_status !== "Failed" && tunnelStatus?.local_mcp_connected !== false) ? "text-emerald-500" : "text-red-500"}>
                MCP: {(tunnelStatus?.local_mcp_status !== "Failed" && tunnelStatus?.local_mcp_connected !== false)
                  ? t.tunnel.localMcpConnected
                  : t.tunnel.localMcpFailed}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Projects */}
        <div
          onClick={() => onNavigate("projects")}
          className="p-5 bg-theme-card border border-theme-card hover:border-indigo-500/50 rounded-xl space-y-3 cursor-pointer transition shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-theme-muted font-medium uppercase tracking-wider">
              {t.overview.authorizedProjectsCard}
            </span>
            <FolderLock className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-theme-primary">{projects.length}</div>
            <div className="text-xs text-theme-muted mt-1">
              {projects.filter((p) => p.enabled).length} {t.common.active} &bull;{" "}
              {projects.filter((p) => p.accessMode === "read-write").length} {t.projects.readWrite}
            </div>
          </div>
        </div>

        {/* Card 4: Approvals */}
        <div
          onClick={() => onNavigate("activity")}
          className="p-5 bg-theme-card border border-theme-card hover:border-indigo-500/50 rounded-xl space-y-3 cursor-pointer transition shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-theme-muted font-medium uppercase tracking-wider">
              {t.status.pendingApprovals}
            </span>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-theme-primary">{pendingApprovals.length}</div>
            <div className="text-xs text-theme-muted mt-1">
              {approvals.filter((a) => a.status === "approved").length} {t.common.approved}
            </div>
          </div>
        </div>

        {/* Card 6: Workflow Sessions */}
        <div
          onClick={() => onNavigate("projects")}
          className="p-5 bg-theme-card border border-theme-card hover:border-indigo-500/50 rounded-xl space-y-3 cursor-pointer transition shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-theme-muted font-medium uppercase tracking-wider">
              {t.overview.activeSessionsCard}
            </span>
            <Compass className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-theme-primary">
              {activeSessionsCount}
            </div>
            <div className="text-xs text-theme-muted mt-1">
              {activeSessionsCount === 1
                ? "1 active session"
                : `${activeSessionsCount} active sessions`}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Center */}
      <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm">
        <h2 className="text-xs font-semibold text-theme-muted uppercase tracking-wider">
          {t.overview.quickActions}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onOpenAuthorizeModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>{t.overview.authorizeProjectBtn}</span>
          </button>

          <button
            onClick={onOpenCreateTokenModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-primary border border-theme-subtle rounded-lg text-xs font-semibold transition"
          >
            <KeyRound className="w-4 h-4 text-indigo-500" />
            <span>{t.overview.createTokenBtn}</span>
          </button>

          <button
            onClick={onOpenEmergencyStopModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-500/15 hover:bg-red-500/25 text-red-500 border border-red-500/30 rounded-lg text-xs font-semibold transition"
          >
            <OctagonAlert className="w-4 h-4 text-red-500" />
            <span>{t.overview.emergencyStopBtn}</span>
          </button>
        </div>
      </div>

      {/* Dual Section: Pending Approvals & Active Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals List */}
        <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-theme-primary">{t.overview.recentApprovals}</h3>
            <button
              onClick={() => onNavigate("activity")}
              className="text-xs text-indigo-500 hover:text-indigo-400 font-medium flex items-center gap-1 transition"
            >
              <span>{t.overview.viewInActivity}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="text-center py-8 text-theme-muted text-xs flex flex-col items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500/70" />
              <span>{t.overview.noPendingApprovals}</span>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.slice(0, 3).map((app) => (
                <div
                  key={app.id}
                  onClick={() => onSelectApproval(app)}
                  className="p-3 bg-theme-card-muted border border-theme-subtle hover:border-indigo-500/40 rounded-lg cursor-pointer transition flex items-center justify-between gap-3"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`badge ${
                          app.risk === "DANGEROUS" ? "badge-red" : "badge-amber"
                        }`}
                      >
                        {app.risk}
                      </span>
                      <span className="text-xs font-semibold text-theme-primary truncate">
                        {app.operation}
                      </span>
                    </div>
                    <p className="text-xs text-theme-muted line-clamp-1">{app.summary}</p>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {onQuickResolveApproval ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickResolveApproval(app.id, "approve");
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold shadow-sm transition"
                        >
                          {t.overview.quickApproveBtn}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickResolveApproval(app.id, "deny");
                          }}
                          className="px-2.5 py-1 bg-red-600/15 hover:bg-red-600/25 text-red-500 border border-red-500/30 rounded text-[11px] font-semibold transition"
                        >
                          {t.overview.quickDenyBtn}
                        </button>
                      </>
                    ) : (
                      <div className="text-xs text-indigo-500 font-medium">
                        {t.common.details}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Jobs List */}
        <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-theme-primary">{t.overview.recentJobs}</h3>
            <button
              onClick={() => onNavigate("jobs")}
              className="text-xs text-indigo-500 hover:text-indigo-400 font-medium flex items-center gap-1 transition"
            >
              <span>{t.common.details}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeJobs.length === 0 ? (
            <div className="text-center py-8 text-theme-muted text-xs flex flex-col items-center gap-2">
              <Clock className="w-6 h-6 text-theme-muted/50" />
              <span>{t.overview.noActiveJobs}</span>
            </div>
          ) : (
            <div className="space-y-3">
              {activeJobs.slice(0, 3).map((job) => (
                <div
                  key={job.jobId}
                  className="p-3 bg-theme-card-muted border border-theme-subtle rounded-lg flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="badge badge-blue">{job.state}</span>
                      <span className="text-xs font-mono text-theme-secondary">{job.jobId}</span>
                    </div>
                    <div className="text-[11px] text-theme-muted">
                      {t.jobs.project}: {job.projectId}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-theme-muted">
                    {job.durationMs ? `${Math.round(job.durationMs / 1000)}s` : t.jobs.running}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
