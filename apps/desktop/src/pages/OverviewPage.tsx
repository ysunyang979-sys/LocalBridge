import React from "react";
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
} from "lucide-react";
import type { ServerStatus, McpStatus, Project, Approval, Job } from "../types.js";
import type { NavPage } from "../components/Sidebar.js";

interface OverviewPageProps {
  serverStatus: ServerStatus | null;
  mcpStatus: McpStatus | null;
  projects: Project[];
  approvals: Approval[];
  jobs: Job[];
  onNavigate: (page: NavPage) => void;
  onOpenAuthorizeModal: () => void;
  onOpenCreateTokenModal: () => void;
  onOpenEmergencyStopModal: () => void;
  onSelectApproval: (approval: Approval) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  serverStatus,
  mcpStatus,
  projects,
  approvals,
  jobs,
  onNavigate,
  onOpenAuthorizeModal,
  onOpenCreateTokenModal,
  onOpenEmergencyStopModal,
  onSelectApproval,
}) => {
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const activeJobs = jobs.filter((j) => j.state === "running" || j.state === "queued");

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top Banner Alert if Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-amber-300">
                {pendingApprovals.length} Pending Approval Request
                {pendingApprovals.length > 1 ? "s" : ""}
              </div>
              <div className="text-xs text-amber-200/70">
                Action required from local human operator within 5 minutes.
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate("approvals")}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs transition"
          >
            Review Requests
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Server */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Local Server
            </span>
            <Server className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">
              {serverStatus ? "Online" : "Connecting..."}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              v{serverStatus?.version || "0.11.0"} &bull; Loopback 127.0.0.1:18080
            </div>
          </div>
        </div>

        {/* Card 2: AI / MCP Channel */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              AI Access (MCP)
            </span>
            <Radio className="w-4 h-4 text-cyan-400" />
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
              <span className={mcpStatus?.paused ? "text-amber-400" : "text-slate-100"}>
                {mcpStatus?.paused ? "Paused" : mcpStatus?.mcpActive ? "Active" : "Down"}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {mcpStatus?.toolsCount || 23} safe tools &bull; MCP {mcpStatus?.protocolVersion || "2026-07-28"}
            </div>
          </div>
        </div>

        {/* Card 3: Projects */}
        <div
          onClick={() => onNavigate("projects")}
          className="p-5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl space-y-3 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Authorized Projects
            </span>
            <FolderLock className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">{projects.length}</div>
            <div className="text-xs text-slate-400 mt-1">
              {projects.filter((p) => p.enabled).length} enabled &bull;{" "}
              {projects.filter((p) => p.accessMode === "read-write").length} read-write
            </div>
          </div>
        </div>

        {/* Card 4: Approvals */}
        <div
          onClick={() => onNavigate("approvals")}
          className="p-5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl space-y-3 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Pending Approvals
            </span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">
              {pendingApprovals.length}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {approvals.filter((a) => a.status === "approved").length} approved all-time
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Center */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-xl space-y-4">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onOpenAuthorizeModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Authorize Project</span>
          </button>

          <button
            onClick={onOpenCreateTokenModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition"
          >
            <KeyRound className="w-4 h-4 text-indigo-400" />
            <span>Generate Token</span>
          </button>

          <button
            onClick={onOpenEmergencyStopModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 rounded-lg text-xs font-semibold transition"
          >
            <OctagonAlert className="w-4 h-4 text-red-400" />
            <span>Emergency Stop</span>
          </button>
        </div>
      </div>

      {/* Dual Section: Pending Approvals & Active Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals List */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Pending Approvals</h3>
            <button
              onClick={() => onNavigate("approvals")}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition"
            >
              View all &rarr;
            </button>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500/60" />
              <span>No pending approvals. System is clear.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.slice(0, 3).map((app) => (
                <div
                  key={app.id}
                  onClick={() => onSelectApproval(app)}
                  className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg cursor-pointer transition flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`badge ${
                          app.risk === "DANGEROUS" ? "badge-red" : "badge-amber"
                        }`}
                      >
                        {app.risk}
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {app.operation}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-1">{app.summary}</p>
                  </div>
                  <div className="text-xs text-indigo-400 font-medium">Review</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Jobs List */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Active Jobs</h3>
            <button
              onClick={() => onNavigate("jobs")}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition"
            >
              View all &rarr;
            </button>
          </div>

          {activeJobs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center gap-2">
              <Clock className="w-6 h-6 text-slate-600" />
              <span>No background jobs currently running.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {activeJobs.slice(0, 3).map((job) => (
                <div
                  key={job.jobId}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="badge badge-blue">{job.state}</span>
                      <span className="text-xs font-mono text-slate-300">{job.jobId}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Project: {job.projectId}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-slate-400">
                    {job.durationMs ? `${Math.round(job.durationMs / 1000)}s` : "Running"}
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
