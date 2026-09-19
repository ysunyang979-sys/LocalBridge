import React, { useState, useEffect, useCallback } from "react";
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

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<NavPage>("overview");

  // State
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runners, setRunners] = useState<RunnerInfo[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [isAuthorizeModalOpen, setIsAuthorizeModalOpen] = useState(false);
  const [isCreateTokenModalOpen, setIsCreateTokenModalOpen] = useState(false);
  const [isEmergencyStopModalOpen, setIsEmergencyStopModalOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);

  // Fetch all state
  const loadData = useCallback(async () => {
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
      ] = await Promise.allSettled([
        bridge.getStatus(),
        bridge.getMcpStatus(),
        bridge.listProjects(),
        bridge.listApprovals(),
        bridge.listJobs(),
        bridge.listRunners(),
        bridge.listTokens(),
        bridge.listAudit(),
      ]);

      if (statusRes.status === "fulfilled") setServerStatus(statusRes.value);
      if (mcpRes.status === "fulfilled") setMcpStatus(mcpRes.value);
      if (projRes.status === "fulfilled") setProjects(projRes.value.projects || []);
      if (appRes.status === "fulfilled") setApprovals(appRes.value.approvals || []);
      if (jobsRes.status === "fulfilled") setJobs(jobsRes.value.jobs || []);
      if (runRes.status === "fulfilled") {
        const val = runRes.value as any;
        const list = Array.isArray(val)
          ? val
          : Array.isArray(val?.runners)
            ? val.runners
            : [];
        setRunners(list);
      }
      if (tokRes.status === "fulfilled") setTokens(tokRes.value.tokens || []);
      if (audRes.status === "fulfilled") setAuditEvents(audRes.value.events || []);
    } catch {
      // Ignored during polling
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
    return () => clearInterval(interval);
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
        />

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
