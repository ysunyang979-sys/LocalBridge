import React, { useState, useEffect, useCallback } from "react";
import {
  FolderLock,
  Plus,
  Radio,
  Server,
  Cpu,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import type {
  ServerStatus,
  McpStatus,
  TunnelStatusDto,
  Project,
  Approval,
  Job,
  WorkflowSession,
  PersistentRuntime,
  LspServerStatus,
} from "../types.js";
import { bridge } from "../api/bridge.js";
import { ApprovalCard } from "../components/ApprovalCard.js";

interface ControlPageProps {
  serverStatus: ServerStatus | null;
  mcpStatus: McpStatus | null;
  tunnelStatus: TunnelStatusDto | null;
  projects: Project[];
  approvals: Approval[];
  jobs: Job[];
  activeSessionsCount?: number;
  onNavigate: (page: any) => void;
  onSelectProject: (projectId: string) => void;
  onOpenAuthorizeModal: () => void;
  onOpenCreateTokenModal: () => void;
  onOpenEmergencyStopModal: () => void;
  onQuickResolveApproval: (id: string, action: "approve" | "deny") => Promise<void>;
}

// Project summary card for the Recent Work section
const RecentProjectCard: React.FC<{
  project: Project;
  onOpen: () => void;
}> = ({ project, onOpen }) => {
  const [runtime, setRuntime] = useState<PersistentRuntime | null>(null);
  const [session, setSession] = useState<WorkflowSession | null>(null);
  const [lspStatus, setLspStatus] = useState<LspServerStatus | null>(null);

  const fetchProjectContext = useCallback(async () => {
    try {
      const [runtimesRes, sessionsRes, lspRes] = await Promise.allSettled([
        bridge.listRuntimes({ projectId: project.id }),
        bridge.listSessions({ projectId: project.id, limit: 1 }),
        bridge.getLspStatus(project.id),
      ]);

      if (runtimesRes.status === "fulfilled" && runtimesRes.value?.runtimes?.length > 0) {
        setRuntime(runtimesRes.value.runtimes[0]);
      } else {
        setRuntime(null);
      }

      if (sessionsRes.status === "fulfilled" && sessionsRes.value?.sessions?.length > 0) {
        setSession(sessionsRes.value.sessions[0]);
      } else {
        setSession(null);
      }

      if (lspRes.status === "fulfilled" && lspRes.value?.servers?.length > 0) {
        setLspStatus(lspRes.value.servers[0]);
      } else {
        setLspStatus(null);
      }
    } catch {
      // Quiet fallback
    }
  }, [project.id]);

  useEffect(() => {
    fetchProjectContext();
    const interval = setInterval(fetchProjectContext, 6000);
    return () => clearInterval(interval);
  }, [fetchProjectContext]);

  const isRuntimeRunning = runtime?.state === "running";
  const isSessionActive = session?.state === "active";
  const hasWorktree = session?.workspace?.mode === "worktree";

  return (
    <div
      onClick={onOpen}
      className="p-5 rounded-xl bg-[#0d1320] border border-white/[0.06] hover:border-white/[0.14] transition-all duration-150 cursor-pointer group shadow-sm flex flex-col justify-between space-y-4"
    >
      {/* Top: Project Info & Open Button */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-theme-primary text-sm tracking-tight group-hover:text-sky-300 transition-colors truncate">
              {project.name}
            </span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                project.enabled
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}
            >
              {project.enabled ? "AUTHORIZED" : "DISABLED"}
            </span>
            {hasWorktree && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                WORKTREE
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-theme-muted truncate max-w-md">
            {project.root}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-theme-muted group-hover:text-theme-primary bg-white/[0.04] group-hover:bg-white/[0.08] transition shrink-0"
        >
          <span>Open</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Middle Grid: Live Execution State */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/[0.04] text-[11px] font-mono">
        {/* Persistent Runtime Status */}
        <div className="p-2 rounded bg-[#070b13] border border-white/[0.04] space-y-0.5">
          <div className="text-theme-muted text-[10px]">Persistent Runtime</div>
          <div className="flex items-center gap-1.5 truncate">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isRuntimeRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
              }`}
            />
            <span
              className={
                isRuntimeRunning
                  ? "text-emerald-400 font-medium truncate"
                  : "text-theme-muted truncate"
              }
            >
              {isRuntimeRunning
                ? `Port ${runtime?.listeningPorts?.[0] || "Active"} · Gen ${runtime?.generation}`
                : "Stopped"}
            </span>
          </div>
        </div>

        {/* Code Intelligence */}
        <div className="p-2 rounded bg-[#070b13] border border-white/[0.04] space-y-0.5">
          <div className="text-theme-muted text-[10px]">Code Intelligence</div>
          <div className="flex items-center gap-1.5 truncate">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                lspStatus?.status === "ready" ? "bg-emerald-400" : "bg-slate-600"
              }`}
            />
            <span
              className={
                lspStatus?.status === "ready"
                  ? "text-emerald-400 truncate"
                  : "text-theme-muted truncate"
              }
            >
              {lspStatus?.status === "ready" ? "TypeScript (Ready)" : "Standby"}
            </span>
          </div>
        </div>

        {/* Workflow Session */}
        <div className="p-2 rounded bg-[#070b13] border border-white/[0.04] space-y-0.5">
          <div className="text-theme-muted text-[10px]">Active Session</div>
          <div className="flex items-center gap-1.5 truncate">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isSessionActive ? "bg-sky-400" : "bg-slate-600"
              }`}
            />
            <span
              className={
                isSessionActive ? "text-sky-300 truncate" : "text-theme-muted truncate"
              }
            >
              {isSessionActive
                ? session?.title || `Session ${session?.id?.slice(0, 6)}`
                : "Idle"}
            </span>
          </div>
        </div>

        {/* Access & Execution */}
        <div className="p-2 rounded bg-[#070b13] border border-white/[0.04] space-y-0.5">
          <div className="text-theme-muted text-[10px]">Security Bounds</div>
          <div className="text-theme-secondary truncate">
            {project.accessMode === "read-write" ? "RW" : "RO"} ·{" "}
            {project.executionMode}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ControlPage: React.FC<ControlPageProps> = ({
  serverStatus,
  mcpStatus,
  tunnelStatus,
  projects,
  approvals,
  jobs,
  onNavigate,
  onSelectProject,
  onOpenAuthorizeModal,
  onOpenCreateTokenModal,
  onOpenEmergencyStopModal,
  onQuickResolveApproval,
}) => {
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const isTunnelConnected =
    tunnelStatus?.status === "Connected" ||
    tunnelStatus?.control_plane_connected === true;

  const handleApprove = async (id: string) => {
    setResolvingId(id);
    try {
      await onQuickResolveApproval(id, "approve");
    } finally {
      setResolvingId(null);
    }
  };

  const handleDeny = async (id: string) => {
    setResolvingId(id);
    try {
      await onQuickResolveApproval(id, "deny");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto select-none">
      {/* 1. Compact System Status Strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Tunnel Card */}
        <div className="p-3.5 rounded-xl bg-[#0d1320] border border-white/[0.06] flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-theme-muted" />
              <span>Secure Tunnel</span>
            </div>
            <div className="text-xs font-semibold text-theme-primary">
              {isTunnelConnected ? "Connected" : "Standby"}
            </div>
            <div className="text-[10px] font-mono text-theme-muted">
              {tunnelStatus?.network_mode === "custom"
                ? "Custom Proxy"
                : tunnelStatus?.network_mode === "direct"
                  ? "Direct"
                  : "System Proxy"}
            </div>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              isTunnelConnected ? "bg-emerald-400" : "bg-slate-500"
            }`}
          />
        </div>

        {/* Control Plane Card */}
        <div className="p-3.5 rounded-xl bg-[#0d1320] border border-white/[0.06] flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
              <Server className="w-3 h-3 text-theme-muted" />
              <span>Control Plane</span>
            </div>
            <div className="text-xs font-semibold text-theme-primary">
              {serverStatus ? "Online" : "Offline"}
            </div>
            <div className="text-[10px] font-mono text-theme-muted">
              127.0.0.1:18080
            </div>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              serverStatus ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
        </div>

        {/* Runner Card */}
        <div className="p-3.5 rounded-xl bg-[#0d1320] border border-white/[0.06] flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
              <Cpu className="w-3 h-3 text-theme-muted" />
              <span>Local Runner</span>
            </div>
            <div className="text-xs font-semibold text-theme-primary">
              {serverStatus?.runners_connected || 0} Connected
            </div>
            <div className="text-[10px] font-mono text-theme-muted">
              Node v{serverStatus?.version || "1.2.0"}
            </div>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              (serverStatus?.runners_connected || 0) > 0
                ? "bg-emerald-400"
                : "bg-amber-400"
            }`}
          />
        </div>

        {/* MCP Card */}
        <div className="p-3.5 rounded-xl bg-[#0d1320] border border-white/[0.06] flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-theme-muted" />
              <span>MCP Protocol</span>
            </div>
            <div className="text-xs font-semibold text-theme-primary">
              {mcpStatus?.paused
                ? "Execution Paused"
                : `${mcpStatus?.toolsCount || 55} Tools Active`}
            </div>
            <div className="text-[10px] font-mono text-theme-muted">
              v{mcpStatus?.protocolVersion || "2024-11-05"}
            </div>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              mcpStatus?.paused
                ? "bg-amber-400"
                : mcpStatus?.mcpActive
                  ? "bg-emerald-400"
                  : "bg-red-400"
            }`}
          />
        </div>
      </section>

      {/* 2. Pending Approvals Banner (If any) */}
      {pendingApprovals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-amber-300 font-semibold">
                Pending Operator Approvals ({pendingApprovals.length})
              </h2>
            </div>
            <button
              onClick={() => onNavigate("activity")}
              className="text-xs text-theme-muted hover:text-theme-primary transition"
            >
              View in Activity timeline ›
            </button>
          </div>

          <div className="space-y-2">
            {pendingApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                projectName={
                  projects.find((p) => p.id === approval.projectId)?.name
                }
                onApprove={handleApprove}
                onDeny={handleDeny}
                isProcessing={resolvingId === approval.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* 3. Hero Section: Recent Work (最近工作区) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-theme-primary tracking-tight">
              Recent Work
            </h2>
            <p className="text-xs text-theme-muted">
              Live status across authorized projects, active runtimes, workflows, and code intelligence.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAuthorizeModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-theme-primary border border-white/[0.08] transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-sky-400" />
              <span>Authorize Project</span>
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="p-10 rounded-xl bg-[#0d1320] border border-white/[0.06] text-center space-y-3">
            <FolderLock className="w-8 h-8 text-theme-muted mx-auto" />
            <div className="text-sm font-medium text-theme-primary">
              No Authorized Projects
            </div>
            <p className="text-xs text-theme-muted max-w-sm mx-auto">
              Authorize a local project directory so ChatGPT and the local MCP runner can inspect code, run tests, and manage persistent runtimes safely.
            </p>
            <button
              onClick={onOpenAuthorizeModal}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm"
            >
              Authorize First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {projects.map((project) => (
              <RecentProjectCard
                key={project.id}
                project={project}
                onOpen={() => onSelectProject(project.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 4. Quick Actions Footer Strip */}
      <section className="pt-4 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenCreateTokenModal}
            className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
          >
            + Generate Token
          </button>
          <span className="text-white/10">|</span>
          <button
            onClick={() => onNavigate("settings")}
            className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
          >
            Tunnel & Outbound Settings
          </button>
          <span className="text-white/10">|</span>
          <button
            onClick={() => onNavigate("activity")}
            className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
          >
            Audit Log ({jobs.length} jobs executed)
          </button>
        </div>

        <button
          onClick={onOpenEmergencyStopModal}
          className="text-red-400 hover:text-red-300 font-mono text-[11px] transition"
        >
          Emergency Halt All
        </button>
      </section>
    </div>
  );
};
