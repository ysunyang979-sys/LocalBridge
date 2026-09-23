import React, { useState, useEffect, useCallback, useRef } from "react";
import { OctagonAlert } from "lucide-react";
import { Sidebar, type NavPage } from "./components/Sidebar.js";
import { Header } from "./components/Header.js";
import { NexusPulseLoading } from "./components/NexusPulseLoading.js";
import { StartupScreen } from "./components/StartupScreen.js";
import { ControlPage } from "./pages/ControlPage.js";
import { ProjectsPage } from "./pages/ProjectsPage.js";
import { JobsPage } from "./pages/JobsPage.js";
import { ConnectionsPage } from "./pages/ConnectionsPage.js";
import { TokensPage } from "./pages/TokensPage.js";
import { ActivityPage } from "./pages/ActivityPage.js";
import { SkillsPage } from "./pages/SkillsPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { AuthorizeProjectModal } from "./components/modals/AuthorizeProjectModal.js";
import { CreateTokenModal } from "./components/modals/CreateTokenModal.js";
import { EmergencyStopModal } from "./components/modals/EmergencyStopModal.js";
import { ResolveApprovalModal } from "./components/modals/ResolveApprovalModal.js";
import { OnboardingModal } from "./components/modals/OnboardingModal.js";
import { FullControlModal } from "./components/modals/FullControlModal.js";
import { AppErrorBoundary } from "./components/common/AppErrorBoundary.js";
import { bridge, type TunnelStatusDto } from "./api/bridge.js";
import { useTranslation } from "./i18n/useTranslation.js";
import type {
  ServerStatus,
  McpStatus,
  Project,
  Approval,
  Job,
  RunnerInfo,
  Token,
  AuditEvent,
  ApprovalRoutingMode,
  UserExperienceMode,
  FullControlStatusDto,
  AIConnectionDto,
  StartupDiagnostics,
} from "./types.js";
import { applyServerPollResult } from "./polling-state.js";

export const App: React.FC = () => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState<NavPage>("overview");

  // User Experience Mode (defaults to standard for all first-time and regular users)
  const [uxMode, setUxMode] = useState<UserExperienceMode>(() => {
    const saved = localStorage.getItem("nexus_ux_mode");
    if (saved === "standard" || saved === "advanced") {
      return saved;
    }
    return "standard";
  });

  const handleUxModeChange = (nextMode: UserExperienceMode) => {
    setUxMode(nextMode);
    localStorage.setItem("nexus_ux_mode", nextMode);
  };

  // First-time onboarding wizard modal
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return !localStorage.getItem("nexus_onboarding_completed");
  });

  // State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatusDto | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runners, setRunners] = useState<RunnerInfo[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [activeSessionsCount, setActiveSessionsCount] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<number | null>(null);
  const lastSuccessfulRefreshRef = useRef<number | null>(null);
  const refreshGeneration = useRef(0);

  // Modals
  const [isAuthorizeModalOpen, setIsAuthorizeModalOpen] = useState(false);
  const [isCreateTokenModalOpen, setIsCreateTokenModalOpen] = useState(false);
  const [isEmergencyStopModalOpen, setIsEmergencyStopModalOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [approvalRoutingMode, setApprovalRoutingMode] = useState<ApprovalRoutingMode>("chat");
  const [fullControlStatus, setFullControlStatus] = useState<FullControlStatusDto | null>(null);
  const [isFullControlModalOpen, setIsFullControlModalOpen] = useState(false);
  const [connections, setConnections] = useState<AIConnectionDto[]>([]);

  // Startup Readiness State
  const [isStartupComplete, setIsStartupComplete] = useState(false);
  const [startupTimeout, setStartupTimeout] = useState(false);
  const [startupDiag, setStartupDiag] = useState<StartupDiagnostics | null>(null);
  const [startupServerReady, setStartupServerReady] = useState(false);
  const [startupRunnerReady, setStartupRunnerReady] = useState(false);
  const [startupMcpReady, setStartupMcpReady] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

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
        tunnelRes,
        sessionsRes,
        routingRes,
        fcRes,
        connRes,
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
        bridge.getTunnelStatus(),
        bridge.listSessions({ state: "active" }),
        bridge.getApprovalRoutingMode(),
        bridge.getFullControlStatus(),
        bridge.listAiConnections(),
      ]);

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
      if (tunnelRes.status === "fulfilled") setTunnelStatus(tunnelRes.value);
      else setTunnelStatus(null);
      if (sessionsRes.status === "fulfilled") setActiveSessionsCount(sessionsRes.value.total || 0);
      else setActiveSessionsCount(0);
      if (routingRes.status === "fulfilled" && routingRes.value?.mode) {
        setApprovalRoutingMode(routingRes.value.mode);
      }
      if (fcRes.status === "fulfilled") setFullControlStatus(fcRes.value);
      else setFullControlStatus(null);
      if (connRes.status === "fulfilled" && connRes.value?.connections) {
        setConnections(connRes.value.connections);
      }
    } catch {
      if (generation === refreshGeneration.current) {
        setServerStatus(null);
        setMcpStatus(null);
        setTunnelStatus(null);
        setProjects([]);
        setApprovals([]);
        setJobs([]);
        setRunners([]);
        setTokens([]);
        setAuditEvents([]);
        setActiveSessionsCount(0);
        setFullControlStatus(null);
      }
    }
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  // Initial startup & readiness polling
  useEffect(() => {
    if (isStartupComplete) return;

    let cancelled = false;
    const timeoutTimer = setTimeout(async () => {
      if (!isStartupComplete && !cancelled) {
        setStartupTimeout(true);
        const diag = await bridge.getStartupDiagnostics();
        if (diag && !cancelled) setStartupDiag(diag);
      }
    }, 15000);

    const poll = async () => {
      if (cancelled || isStartupComplete) return;
      try {
        const health = await bridge.getDesktopHealth();
        if (cancelled) return;
        if (health) {
          if (health.startup_error) {
            setStartupError(health.startup_error);
            setStartupTimeout(true);
            const diag = await bridge.getStartupDiagnostics();
            if (diag && !cancelled) setStartupDiag(diag);
            return;
          }
          if (health.server_running) {
            setStartupServerReady(true);
          }
          if (health.runner_running) {
            setStartupRunnerReady(true);
          }
          if (health.ready) {
            setStartupServerReady(true);
            setStartupRunnerReady(true);
            setStartupMcpReady(true);
            clearTimeout(timeoutTimer);
            await loadData();
            if (!cancelled) {
              setIsStartupComplete(true);
            }
            return;
          }
        } else {
          // Outside Tauri (e.g. browser dev mode)
          try {
            const status = await bridge.getStatus();
            if (status) {
              setStartupServerReady(true);
              setStartupRunnerReady(true);
              setStartupMcpReady(true);
              clearTimeout(timeoutTimer);
              await loadData();
              if (!cancelled) {
                setIsStartupComplete(true);
              }
              return;
            }
          } catch {
            // Server not up yet, keep polling
          }
        }
      } catch {
        // Keep polling
      }
    };

    poll();
    const interval = setInterval(poll, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutTimer);
      clearInterval(interval);
    };
  }, [isStartupComplete, retryNonce, loadData]);

  // Regular data polling after startup
  useEffect(() => {
    if (!isStartupComplete) return;
    const interval = setInterval(loadData, 3000);
    return () => {
      refreshGeneration.current++;
      clearInterval(interval);
    };
  }, [isStartupComplete, loadData]);

  const handleRetryStartup = () => {
    setStartupTimeout(false);
    setStartupError(null);
    setStartupServerReady(false);
    setStartupRunnerReady(false);
    setStartupMcpReady(false);
    setStartupDiag(null);
    setRetryNonce((n) => n + 1);
  };

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

  const handleStopFullControl = async () => {
    try {
      await bridge.stopFullControl();
      const fc = await bridge.getFullControlStatus();
      setFullControlStatus(fc);
    } catch (err) {
      console.error("Failed to stop full control:", err);
    }
  };

  // Handle Approval Routing Mode Change
  const handleChangeApprovalRoutingMode = async (mode: ApprovalRoutingMode) => {
    try {
      await bridge.setApprovalRoutingMode(mode);
      setApprovalRoutingMode(mode);
      await loadData();
    } catch (err) {
      console.error("Failed to update approval routing mode:", err);
    }
  };

  const pendingApprovalsCount = approvals.filter((a) => a.status === "pending").length;
  const activeJobsCount = jobs.filter(
    (j) => j.state === "running" || j.state === "queued"
  ).length;

  const pageTitles: Record<NavPage, { title: string; subtitle: string }> = {
    overview: {
      title: t.overview.title,
      subtitle: t.overview.subtitle,
    },
    projects: {
      title: t.projects.title,
      subtitle: t.projects.subtitle,
    },
    approvals: {
      title: t.activity.title,
      subtitle: t.activity.subtitle,
    },
    jobs: {
      title: t.jobs.title,
      subtitle: t.jobs.subtitle,
    },
    connections: {
      title: t.connections.title,
      subtitle: t.connections.subtitle,
    },
    tokens: {
      title: t.tokens.title,
      subtitle: t.tokens.subtitle,
    },
    activity: {
      title: t.activity.title,
      subtitle: t.activity.subtitle,
    },
    skills: {
      title: t.skills.title,
      subtitle: t.skills.subtitle,
    },
    settings: {
      title: t.settings.title,
      subtitle: t.settings.subtitle,
    },
  };

  const handleNavigate = (page: NavPage) => {
    if (page !== "projects") {
      setSelectedProjectId(null);
    }
    setCurrentPage(page);
  };

  if (!isStartupComplete) {
    return (
      <StartupScreen
        isTimeout={startupTimeout}
        startupError={startupError}
        serverReady={startupServerReady}
        runnerReady={startupRunnerReady}
        mcpReady={startupMcpReady}
        diagnostics={startupDiag}
        onRetry={handleRetryStartup}
        onOpenLogs={() => bridge.openLogsFolder()}
        onQuit={() => bridge.quitNexus()}
      />
    );
  }

  return (
    <div className="flex h-screen bg-theme-base text-theme-primary font-sans antialiased overflow-hidden select-none">
      {/* Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onSelectPage={handleNavigate}
        pendingApprovalsCount={pendingApprovalsCount}
        activeJobsCount={activeJobsCount}
        serverStatus={serverStatus}
        mcpStatus={mcpStatus}
        runnersCount={runners.length}
        tunnelStatus={tunnelStatus}
        uxMode={uxMode}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title={
            currentPage === "projects" && selectedProjectId
              ? (projects.find((p) => p.id === selectedProjectId)?.name || "Project Detail")
              : pageTitles[currentPage].title
          }
          subtitle={
            currentPage === "projects" && selectedProjectId
              ? (projects.find((p) => p.id === selectedProjectId)?.root || pageTitles[currentPage].subtitle)
              : pageTitles[currentPage].subtitle
          }
          breadcrumb={currentPage === "projects" && selectedProjectId ? "Project Detail" : undefined}
          mcpStatus={mcpStatus}
          approvalRoutingMode={approvalRoutingMode}
          onChangeApprovalRoutingMode={handleChangeApprovalRoutingMode}
          onTogglePause={handleTogglePause}
          onTriggerEmergencyStop={() => setIsEmergencyStopModalOpen(true)}
          onRefreshAll={handleManualRefresh}
          isRefreshing={isRefreshing}
          serverAvailable={serverStatus !== null}
          lastSuccessfulRefresh={lastSuccessfulRefresh}
          uxMode={uxMode}
          fullControlStatus={fullControlStatus}
          onOpenFullControl={() => setIsFullControlModalOpen(true)}
          onStopFullControl={handleStopFullControl}
        />

        <NexusPulseLoading
          isReady={serverStatus !== null}
          tunnelConnected={
            tunnelStatus?.status === "Connected" ||
            tunnelStatus?.control_plane_connected === true
          }
          runnerConnected={runners.length > 0}
          mcpActive={mcpStatus !== null && !mcpStatus.paused}
          toolsCount={mcpStatus?.toolsCount}
        />

        {startupError && (
          <div className="m-6 p-6 bg-red-500/10 border border-red-500/30 rounded-xl space-y-3">
            <div className="flex items-center gap-3 text-red-500">
              <OctagonAlert className="w-6 h-6 shrink-0" />
              <div>
                <div className="font-semibold text-sm">
                  Nexus Core Server failed to start / 核心服务启动失败
                </div>
                <div className="text-xs text-red-400 font-mono mt-1">
                  Reason: {startupError}
                </div>
              </div>
            </div>
            <div className="text-xs text-theme-muted space-y-1 pl-9">
              <div>&bull; Verify bundled runtime resources are intact.</div>
              <div>&bull; Ensure port 18080 is not occupied by another process.</div>
            </div>
            <div className="pl-9 pt-1">
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition"
              >
                {isRefreshing ? t.common.refreshing : t.common.refresh}
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          <AppErrorBoundary
            isZh={t.common ? true : false}
            componentName="MainRoute"
            onReset={loadData}
          >
            {currentPage === "overview" && (
              <ControlPage
                serverStatus={serverStatus}
                mcpStatus={mcpStatus}
                tunnelStatus={tunnelStatus}
                projects={projects}
                approvals={approvals}
                jobs={jobs}
                activeSessionsCount={activeSessionsCount}
                onNavigate={handleNavigate}
                onSelectProject={(id) => {
                  setSelectedProjectId(id);
                  setCurrentPage("projects");
                }}
                onOpenAuthorizeModal={() => setIsAuthorizeModalOpen(true)}
                onOpenCreateTokenModal={() => setIsCreateTokenModalOpen(true)}
                onOpenEmergencyStopModal={() => setIsEmergencyStopModalOpen(true)}
                onQuickResolveApproval={async (id, action) => {
                  await bridge.resolveApproval(id, action);
                  await loadData();
                }}
                uxMode={uxMode}
                fullControlStatus={fullControlStatus}
                onRefresh={loadData}
                onOpenFullControlModal={() => setIsFullControlModalOpen(true)}
              />
            )}

            {currentPage === "projects" && (
              <ProjectsPage
                projects={projects}
                onOpenAuthorizeModal={() => setIsAuthorizeModalOpen(true)}
                onRefresh={loadData}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                uxMode={uxMode}
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

            {(currentPage === "activity" || (currentPage as string) === "approvals") && (
              <ActivityPage
                events={auditEvents}
                approvals={approvals}
                onRefresh={loadData}
                initialFilter={(currentPage as string) === "approvals" ? "approvals" : "all"}
                onResolveApproval={async (id, action) => {
                  await bridge.resolveApproval(id, action);
                  await loadData();
                }}
                uxMode={uxMode}
              />
            )}

            {currentPage === "skills" && (
              <SkillsPage
                uxMode={uxMode}
                projectId={selectedProjectId ?? undefined}
              />
            )}

            {currentPage === "settings" && (
              <SettingsPage
                tunnelStatus={tunnelStatus}
                onRefresh={loadData}
                uxMode={uxMode}
                onChangeUxMode={handleUxModeChange}
              />
            )}
          </AppErrorBoundary>
        </main>
      </div>

      {/* Modals */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onAuthorizeProject={() => setIsAuthorizeModalOpen(true)}
        onDownloadLaya={async () => {
          try {
            await bridge.downloadAndEnableModel();
          } catch (err) {
            console.error("Failed to start Laya download from onboarding:", err);
          }
        }}
      />

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

      <FullControlModal
        isOpen={isFullControlModalOpen}
        onClose={() => setIsFullControlModalOpen(false)}
        onStarted={async () => {
          await loadData();
        }}
        currentProjectId={selectedProjectId || (projects.length > 0 ? projects[0].id : undefined)}
        currentProjectName={
          (projects.find((p) => p.id === selectedProjectId) || projects[0])?.name
        }
        connections={connections}
      />
    </div>
  );
};
