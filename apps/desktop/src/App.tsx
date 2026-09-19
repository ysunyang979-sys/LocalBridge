import React, { useState, useEffect, useCallback, useRef } from "react";
import { OctagonAlert } from "lucide-react";
import { Sidebar, type NavPage } from "./components/Sidebar.js";
import { Header } from "./components/Header.js";
import { OverviewPage } from "./pages/OverviewPage.js";
import { ProjectsPage } from "./pages/ProjectsPage.js";
import { ApprovalsPage } from "./pages/ApprovalsPage.js";
import { JobsPage } from "./pages/JobsPage.js";
import { ConnectionsPage } from "./pages/ConnectionsPage.js";
import { TokensPage } from "./pages/TokensPage.js";
import { ActivityPage } from "./pages/ActivityPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { AuthorizeProjectModal } from "./components/modals/AuthorizeProjectModal.js";
import { CreateTokenModal } from "./components/modals/CreateTokenModal.js";
import { EmergencyStopModal } from "./components/modals/EmergencyStopModal.js";
import { ResolveApprovalModal } from "./components/modals/ResolveApprovalModal.js";
import { bridge } from "./api/bridge.js";
import type {
  ServerStatus,
  McpStatus,
  Project,
  Approval,
  Job,
  RunnerInfo,
  Token,
  AuditEvent,
} from "./types.js";
import { applyServerPollResult } from "./polling-state.js";

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<NavPage>("overview");

  // State
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runners, setRunners] = useState<RunnerInfo[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<number | null>(null);
  const lastSuccessfulRefreshRef = useRef<number | null>(null);
  const refreshGeneration = useRef(0);

  // Modals
  const [isAuthorizeModalOpen, setIsAuthorizeModalOpen] = useState(false);
  const [isCreateTokenModalOpen, setIsCreateTokenModalOpen] = useState(false);
  const [isEmergencyStopModalOpen, setIsEmergencyStopModalOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);

  // Fetch all state
  const loadData = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const [
        statusRes,
        mcpRes,
        projRes,
        appRes,
        jobsRes,
        runRes,
        tokRes,
        audRes,
        healthRes,
      ] = await Promise.allSettled([
        bridge.getStatus(),
        bridge.getMcpStatus(),
        bridge.listProjects(),
        bridge.listApprovals(),
        bridge.listJobs(),
        bridge.listRunners(),
        bridge.listTokens(),
        bridge.listAudit(),
        bridge.getDesktopHealth(),
      ]);

      // A slower, older poll must never overwrite fresher state.
      if (generation !== refreshGeneration.current) return;

      if (healthRes.status === "fulfilled" && healthRes.value?.startup_error) {
        setStartupError(healthRes.value.startup_error);
      } else {
        setStartupError(null);
      }

      const nextServer = applyServerPollResult(
        { serverStatus: null, lastSuccessfulRefresh: lastSuccessfulRefreshRef.current },
        statusRes
      );
      lastSuccessfulRefreshRef.current = nextServer.lastSuccessfulRefresh;
      setServerStatus(nextServer.serverStatus);
      setLastSuccessfulRefresh(nextServer.lastSuccessfulRefresh);
      if (mcpRes.status === "fulfilled") setMcpStatus(mcpRes.value);
      else setMcpStatus(null);
      if (projRes.status === "fulfilled") setProjects(projRes.value.projects || []);
      else setProjects([]);
      if (appRes.status === "fulfilled") setApprovals(appRes.value.approvals || []);
      else setApprovals([]);
      if (jobsRes.status === "fulfilled") setJobs(jobsRes.value.jobs || []);
      else setJobs([]);
      if (runRes.status === "fulfilled") {
        const val = runRes.value as any;
        const list = Array.isArray(val)
          ? val
          : Array.isArray(val?.runners)
            ? val.runners
            : [];
        setRunners(list);
      } else setRunners([]);
      if (tokRes.status === "fulfilled") setTokens(tokRes.value.tokens || []);
      else setTokens([]);
      if (audRes.status === "fulfilled") setAuditEvents(audRes.value.events || []);
      else setAuditEvents([]);
    } catch {
      if (generation === refreshGeneration.current) {
        setServerStatus(null);
        setMcpStatus(null);
        setProjects([]);
        setApprovals([]);
        setJobs([]);
        setRunners([]);
        setTokens([]);
        setAuditEvents([]);
      }
    }
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => {
      refreshGeneration.current++;
      clearInterval(interval);
    };
  }, [loadData]);

  // Toggle Global Pause
  const handleTogglePause = async () => {
    const nextPaused = !(mcpStatus?.paused ?? false);
    try {
      await bridge.setPauseState(nextPaused);
      await loadData();
    } catch (err) {
      console.error("Failed to toggle pause:", err);
    }
  };

  const pendingApprovalsCount = approvals.filter((a) => a.status === "pending").length;
  const activeJobsCount = jobs.filter(
    (j) => j.state === "running" || j.state === "queued"
  ).length;

  const pageTitles: Record<NavPage, { title: string; subtitle: string }> = {
    overview: {
      title: "System Overview",
      subtitle: "Unified status of server, runners, AI MCP access, and active tasks",
    },
    projects: {
      title: "Project Authorizations",
      subtitle: "Authorized filesystem sandboxes and command permissions",
    },
    approvals: {
      title: "Approval Center",
      subtitle: "Human review required for sensitive operations",
    },
    jobs: {
      title: "Jobs & Tasks",
      subtitle: "Background builds, tests, and long-running processes",
    },
    connections: {
      title: "Service Connections",
      subtitle: "LocalBridge Core Server and connected Runner daemons",
    },
    tokens: {
      title: "Authentication Tokens",
      subtitle: "Bearer tokens for AI clients and local runners",
    },
    activity: {
      title: "Activity Stream",
      subtitle: "Sanitized audit trail of recent MCP tool invocations",
    },
    settings: {
      title: "Settings",
      subtitle: "System configuration, port bindings, and security guarantees",
    },
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onSelectPage={setCurrentPage}
        pendingApprovalsCount={pendingApprovalsCount}
        activeJobsCount={activeJobsCount}
        serverStatus={serverStatus}
        mcpStatus={mcpStatus}
        runnersCount={runners.length}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title={pageTitles[currentPage].title}
          subtitle={pageTitles[currentPage].subtitle}
          mcpStatus={mcpStatus}
          onTogglePause={handleTogglePause}
          onTriggerEmergencyStop={() => setIsEmergencyStopModalOpen(true)}
          onRefreshAll={handleManualRefresh}
          isRefreshing={isRefreshing}
          serverAvailable={serverStatus !== null}
          lastSuccessfulRefresh={lastSuccessfulRefresh}
        />

        {startupError && (
          <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-3 flex items-center gap-3 text-red-300 text-xs">
            <OctagonAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-medium">{startupError}</span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          {currentPage === "overview" && (
            <OverviewPage
              serverStatus={serverStatus}
              mcpStatus={mcpStatus}
              projects={projects}
              approvals={approvals}
              jobs={jobs}
              onNavigate={setCurrentPage}
              onOpenAuthorizeModal={() => setIsAuthorizeModalOpen(true)}
              onOpenCreateTokenModal={() => setIsCreateTokenModalOpen(true)}
              onOpenEmergencyStopModal={() => setIsEmergencyStopModalOpen(true)}
              onSelectApproval={setSelectedApproval}
            />
          )}

          {currentPage === "projects" && (
            <ProjectsPage
              projects={projects}
              onOpenAuthorizeModal={() => setIsAuthorizeModalOpen(true)}
              onRefresh={loadData}
            />
          )}

          {currentPage === "approvals" && (
            <ApprovalsPage
              approvals={approvals}
              onSelectApproval={setSelectedApproval}
              onRefresh={loadData}
            />
          )}

          {currentPage === "jobs" && (
            <JobsPage jobs={jobs} onRefresh={loadData} />
          )}

          {currentPage === "connections" && (
            <ConnectionsPage
              serverStatus={serverStatus}
              runners={runners}
              onRefresh={loadData}
            />
          )}

          {currentPage === "tokens" && (
            <TokensPage
              tokens={tokens}
              onOpenCreateTokenModal={() => setIsCreateTokenModalOpen(true)}
              onRefresh={loadData}
            />
          )}

          {currentPage === "activity" && (
            <ActivityPage events={auditEvents} onRefresh={loadData} />
          )}

          {currentPage === "settings" && (
            <SettingsPage onRefresh={loadData} />
          )}
        </main>
      </div>

      {/* Modals */}
      <AuthorizeProjectModal
        isOpen={isAuthorizeModalOpen}
        onClose={() => setIsAuthorizeModalOpen(false)}
        onSuccess={loadData}
      />

      <CreateTokenModal
        isOpen={isCreateTokenModalOpen}
        onClose={() => setIsCreateTokenModalOpen(false)}
        onSuccess={loadData}
      />

      <EmergencyStopModal
        isOpen={isEmergencyStopModalOpen}
        onClose={() => setIsEmergencyStopModalOpen(false)}
        onSuccess={loadData}
      />

      <ResolveApprovalModal
        approval={selectedApproval}
        isOpen={Boolean(selectedApproval)}
        onClose={() => setSelectedApproval(null)}
        onSuccess={loadData}
      />
    </div>
  );
};
