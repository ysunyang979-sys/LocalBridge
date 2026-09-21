import React, { useState, useEffect, useCallback } from "react";
import {
  FolderLock,
  Plus,
  Radio,
  Server,
  Cpu,
  ShieldCheck,
  ChevronRight,
  Brain,
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
  IntelligenceStatusDto,
} from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
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
  const { t } = useTranslation();
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
      className="p-5 rounded-xl bg-theme-card border border-theme-subtle hover:border-theme-strong transition-all duration-150 cursor-pointer group shadow-sm flex flex-col justify-between space-y-4"
    >
      {/* Top: Project Info & Open Button */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-theme-primary text-sm tracking-tight group-hover:text-sky-500 dark:group-hover:text-sky-300 transition-colors truncate">
              {project.name}
            </span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                project.enabled
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
              }`}
            >
              {project.enabled
                ? (t.control?.statusAuthorized || "AUTHORIZED")
                : (t.control?.statusDisabled || "DISABLED")}
            </span>
            {hasWorktree && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-300 border border-sky-500/20">
                {t.control?.tagWorktree || "WORKTREE"}
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
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-theme-muted group-hover:text-theme-primary bg-theme-card-muted group-hover:bg-theme-card-hover border border-theme-subtle transition shrink-0"
        >
          <span>{t.control?.openProject || "Open"}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Middle Grid: Live Execution State */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-theme-subtle text-[11px] font-mono">
        {/* Persistent Runtime Status */}
        <div className="p-2 rounded bg-theme-card-muted border border-theme-subtle space-y-0.5">
          <div className="text-theme-muted text-[10px]">
            {t.control?.persistentRuntime || "Persistent Runtime"}
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isRuntimeRunning ? "bg-emerald-500 animate-pulse" : "bg-slate-400 dark:bg-slate-600"
              }`}
            />
            <span
              className={
                isRuntimeRunning
                  ? "text-emerald-600 dark:text-emerald-400 font-medium truncate"
                  : "text-theme-muted truncate"
              }
            >
              {isRuntimeRunning
                ? `Port ${runtime?.listeningPorts?.[0] || "Active"} · Gen ${runtime?.generation}`
                : (t.control?.runtimeStopped || "Stopped")}
            </span>
          </div>
        </div>

        {/* Code Intelligence */}
        <div className="p-2 rounded bg-theme-card-muted border border-theme-subtle space-y-0.5">
          <div className="text-theme-muted text-[10px]">
            {t.control?.codeIntelligence || "Code Intelligence"}
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                lspStatus?.status === "ready" ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-600"
              }`}
            />
            <span
              className={
                lspStatus?.status === "ready"
                  ? "text-emerald-600 dark:text-emerald-400 truncate"
                  : "text-theme-muted truncate"
              }
            >
              {lspStatus?.status === "ready"
                ? (t.control?.codeIntelligenceReady || "TypeScript (Ready)")
                : (t.control?.codeIntelligenceStandby || "Standby")}
            </span>
          </div>
        </div>

        {/* Workflow Session */}
        <div className="p-2 rounded bg-theme-card-muted border border-theme-subtle space-y-0.5">
          <div className="text-theme-muted text-[10px]">
            {t.control?.activeSession || "Active Session"}
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isSessionActive ? "bg-sky-500" : "bg-slate-400 dark:bg-slate-600"
              }`}
            />
            <span
              className={
                isSessionActive ? "text-sky-600 dark:text-sky-300 truncate" : "text-theme-muted truncate"
              }
            >
              {isSessionActive
                ? session?.title || `Session ${session?.id?.slice(0, 6)}`
                : (t.control?.sessionIdle || "Idle")}
            </span>
          </div>
        </div>

        {/* Access & Execution */}
        <div className="p-2 rounded bg-theme-card-muted border border-theme-subtle space-y-0.5">
          <div className="text-theme-muted text-[10px]">
            {t.control?.securityBounds || "Security Bounds"}
          </div>
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
  const { t } = useTranslation();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [intelStatus, setIntelStatus] = useState<IntelligenceStatusDto | null>(null);

  useEffect(() => {
    bridge.getIntelligenceStatus().then(setIntelStatus).catch(() => {});
    const interval = setInterval(() => {
      bridge.getIntelligenceStatus().then(setIntelStatus).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, []);

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
      {/* 1. Compact System Status Strip with Laya Decision Intelligence */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Tunnel Card */}
        <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-sky-500" />
              <span>{t.control?.secureTunnel || "Secure Tunnel"}</span>
            </div>
            <div className="text-xs font-semibold text-theme-primary">
              {isTunnelConnected
                ? (t.control?.tunnelConnected || "Connected")
                : (t.control?.tunnelStandby || "Standby")}
            </div>
            <div className="text-[10px] font-mono text-theme-muted">
              {tunnelStatus?.network_mode === "custom"
                ? (t.control?.proxyCustom || "Custom Proxy")
                : tunnelStatus?.network_mode === "direct"
                  ? (t.control?.proxyDirect || "Direct")
                  : (t.control?.proxySystem || "System Proxy")}
            </div>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              isTunnelConnected ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"
            }`}
          />
        </div>

        {/* Control Plane Card */}
        <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
              <Server className="w-3 h-3 text-theme-muted" />
              <span>{t.control?.controlPlane || "Control Plane"}</span>
            </div>
            <div className="text-xs font-semibold text-theme-primary">
              {serverStatus
                ? (t.control?.serverOnline || "Online")
                : (t.control?.serverOffline || "Offline")}
            </div>
            <div className="text-[10px] font-mono text-theme-muted">
              127.0.0.1:18080
            </div>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              serverStatus ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
        </div>

        {/* Runner Card */}
        <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
              <Cpu className="w-3 h-3 text-theme-muted" />
              <span>{t.control?.localRunner || "Local Runner"}</span>
            </div>
            <div className="text-xs font-semibold text-theme-primary">
              {serverStatus?.runners_connected || 0} {t.control?.runnerConnected || "Connected"}
            </div>
            <div className="text-[10px] font-mono text-theme-muted">
              Node v{serverStatus?.version || "1.2.0"}
            </div>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              (serverStatus?.runners_connected || 0) > 0
                ? "bg-emerald-500"
                : "bg-amber-500"
            }`}
          />
        </div>

        {/* MCP Card */}
        <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-theme-muted" />
              <span>{t.control?.mcpProtocol || "MCP Protocol"}</span>
            </div>
            <div className="text-xs font-semibold text-theme-primary">
              {mcpStatus?.paused
                ? (t.control?.mcpPaused || "Execution Paused")
                : `${mcpStatus?.toolsCount || 55} ${t.control?.mcpToolsActive || "Tools Active"}`}
            </div>
            <div className="text-[10px] font-mono text-theme-muted">
              v{mcpStatus?.protocolVersion || "2024-11-05"}
            </div>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              mcpStatus?.paused
                ? "bg-amber-500"
                : mcpStatus?.mcpActive
                  ? "bg-emerald-500"
                  : "bg-red-500"
            }`}
          />
        </div>

        {/* Decision Intelligence (Laya) Compact Card */}
        <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
              <Brain className="w-3 h-3 text-sky-500" />
              <span>{t.control?.intelligencePill || "Decision Intelligence"}</span>
            </div>
            <div className="text-xs font-semibold text-theme-primary">
              {intelStatus?.provider === "laya" && intelStatus?.status === "ready"
                ? `Laya · ${t.control?.intelligenceReady || "Ready"}`
                : intelStatus?.provider === "laya"
                  ? `Laya · ${t.intelligence?.statusLoading || "Loading"}`
                  : (t.control?.intelligenceDisabled || "Disabled")}
            </div>
            <div className="text-[10px] font-mono text-theme-muted truncate max-w-[120px]">
              {(intelStatus?.latencyMs || intelStatus?.inferenceTimeMs) ? `${intelStatus.latencyMs || intelStatus.inferenceTimeMs}ms` : "mmBERT-base"}
            </div>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              intelStatus?.status === "ready"
                ? "bg-emerald-500"
                : intelStatus?.status === "loading"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-slate-400 dark:bg-slate-600"
            }`}
          />
        </div>
      </section>

      {/* 2. Pending Approvals Banner (If any) */}
      {pendingApprovals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-amber-600 dark:text-amber-300 font-semibold">
                {t.control?.pendingApprovals || "Pending Operator Approvals"} ({pendingApprovals.length})
              </h2>
            </div>
            <button
              onClick={() => onNavigate("activity")}
              className="text-xs text-theme-muted hover:text-theme-primary transition"
            >
              {t.control?.viewInActivity || "View in Activity timeline ›"}
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
              {t.control?.recentWork || "Recent Work"}
            </h2>
            <p className="text-xs text-theme-muted">
              {t.control?.recentWorkDesc ||
                "Live status across authorized projects, active runtimes, workflows, and code intelligence."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAuthorizeModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-card hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-sky-500" />
              <span>{t.control?.authorizeProject || "Authorize Project"}</span>
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="p-10 rounded-xl bg-theme-card border border-theme-subtle text-center space-y-3 shadow-sm">
            <FolderLock className="w-8 h-8 text-theme-muted mx-auto" />
            <div className="text-sm font-medium text-theme-primary">
              {t.control?.noAuthorizedProjects || "No Authorized Projects"}
            </div>
            <p className="text-xs text-theme-muted max-w-sm mx-auto">
              {t.control?.noAuthorizedProjectsDesc ||
                "Authorize a local project directory so ChatGPT and the local MCP runner can inspect code, run tests, and manage persistent runtimes safely."}
            </p>
            <button
              onClick={onOpenAuthorizeModal}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm"
            >
              {t.control?.authorizeFirstProject || "Authorize First Project"}
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
      <section className="pt-4 border-t border-theme-subtle flex items-center justify-between flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenCreateTokenModal}
            className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
          >
            {t.control?.generateToken || "+ Generate Token"}
          </button>
          <span className="text-theme-muted/30">|</span>
          <button
            onClick={() => onNavigate("settings")}
            className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
          >
            {t.control?.tunnelOutboundSettings || "Tunnel & Outbound Settings"}
          </button>
          <span className="text-theme-muted/30">|</span>
          <button
            onClick={() => onNavigate("activity")}
            className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
          >
            {t.control?.auditLog || "Audit Log"} ({jobs.length} {t.control?.jobsExecuted || "jobs executed"})
          </button>
        </div>

        <button
          onClick={onOpenEmergencyStopModal}
          className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-mono text-[11px] transition"
        >
          {t.control?.emergencyHaltAll || "Emergency Halt All"}
        </button>
      </section>
    </div>
  );
};

