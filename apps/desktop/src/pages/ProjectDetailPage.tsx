import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  RotateCcw,
  Square,
  Terminal,
  Code2,
  Compass,
  GitBranch,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
} from "lucide-react";
import type {
  Project,
  PersistentRuntime,
  WorkflowSession,
  LspServerStatus,
  RuntimeLogChunk,
} from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { SessionDetailModal } from "../components/modals/SessionDetailModal.js";

interface ProjectDetailPageProps {
  projectId: string;
  onBack: () => void;
  onRefreshProjects: () => void;
}

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({
  projectId,
  onBack,
  onRefreshProjects,
}) => {
  const { translateError } = useTranslation();

  // Core Data States
  const [project, setProject] = useState<Project | null>(null);
  const [selectedRuntime, setSelectedRuntime] = useState<PersistentRuntime | null>(null);
  const [sessions, setSessions] = useState<WorkflowSession[]>([]);
  const [lspStatus, setLspStatus] = useState<LspServerStatus | null>(null);
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<WorkflowSession | null>(null);

  // Runtime Logs State
  const [logs, setLogs] = useState<RuntimeLogChunk[]>([]);
  const [selectedGen, setSelectedGen] = useState<number>(1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Actions in progress & error
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [worktreeSafetyWarning, setWorktreeSafetyWarning] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Load project details and dependencies
  const loadProjectData = useCallback(async () => {
    try {
      const [projRes, runtimesRes, sessionsRes, lspRes] = await Promise.allSettled([
        bridge.listProjects(),
        bridge.listRuntimes({ projectId }),
        bridge.listSessions({ projectId, limit: 10 }),
        bridge.getLspStatus(projectId),
      ]);

      if (projRes.status === "fulfilled") {
        const found = projRes.value.projects.find((p) => p.id === projectId);
        if (found) setProject(found);
      }

      if (runtimesRes.status === "fulfilled") {
        const list = runtimesRes.value?.runtimes || [];
        if (list.length > 0) {
          setSelectedRuntime((prev) => {
            if (!prev) return list[0];
            const updated = list.find((r) => r.runtimeId === prev.runtimeId);
            return updated || list[0];
          });
        } else {
          setSelectedRuntime(null);
        }
      }

      if (sessionsRes.status === "fulfilled") {
        setSessions(sessionsRes.value?.sessions || []);
      }

      if (lspRes.status === "fulfilled" && lspRes.value?.servers?.length > 0) {
        setLspStatus(lspRes.value.servers[0]);
      } else {
        setLspStatus(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load project details");
    }
  }, [projectId]);

  // Polling for project status
  useEffect(() => {
    loadProjectData();
    const interval = setInterval(loadProjectData, 4000);
    return () => clearInterval(interval);
  }, [loadProjectData]);

  // Update selectedGen when runtime generation changes
  useEffect(() => {
    if (selectedRuntime) {
      setSelectedGen(selectedRuntime.generation);
    }
  }, [selectedRuntime?.runtimeId, selectedRuntime?.generation]);

  // Poll logs for the selected runtime
  const fetchLogs = useCallback(async () => {
    if (!selectedRuntime) {
      setLogs([]);
      return;
    }
    try {
      const res = await bridge.getRuntimeLogs(selectedRuntime.runtimeId, {
        generation: selectedGen,
        limit: 200,
      });
      if (res && Array.isArray(res.entries)) {
        setLogs(res.entries);
      }
    } catch {
      // Quiet log poll failure
    }
  }, [selectedRuntime, selectedGen]);

  useEffect(() => {
    fetchLogs();
    const logInterval = setInterval(fetchLogs, 2500);
    return () => clearInterval(logInterval);
  }, [fetchLogs]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Handlers for Project Actions
  const handleToggleAccess = async () => {
    if (!project) return;
    const newMode = project.accessMode === "read-only" ? "read-write" : "read-only";
    setActionLoading("access");
    setErrorMsg(null);
    try {
      const updated = await bridge.setProjectAccess(project.id, newMode);
      setProject(updated);
      onRefreshProjects();
    } catch (err: any) {
      setErrorMsg(translateError(err.code, err.message));
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeExecution = async (mode: "disabled" | "safe-only" | "project-code") => {
    if (!project) return;
    if (mode === "project-code") {
      const ok = window.confirm(
        `WARNING: Project Code mode allows running build and test scripts defined in ${project.name}. Proceed?`
      );
      if (!ok) return;
    }
    setActionLoading("execution");
    setErrorMsg(null);
    try {
      const updated = await bridge.setProjectExecution(project.id, mode);
      setProject(updated);
      onRefreshProjects();
    } catch (err: any) {
      setErrorMsg(translateError(err.code, err.message));
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleEnable = async () => {
    if (!project) return;
    setActionLoading("enable");
    setErrorMsg(null);
    try {
      const updated = project.enabled
        ? await bridge.disableProject(project.id)
        : await bridge.enableProject(project.id);
      setProject(updated);
      onRefreshProjects();
    } catch (err: any) {
      setErrorMsg(translateError(err.code, err.message));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveProject = async () => {
    if (!project) return;
    setActionLoading("remove");
    setErrorMsg(null);
    try {
      await bridge.removeProject(project.id);
      onRefreshProjects();
      onBack();
    } catch (err: any) {
      setErrorMsg(translateError(err.code, err.message));
      setActionLoading(null);
    }
  };

  // Handlers for Runtime Actions
  const handleStopRuntime = async () => {
    if (!selectedRuntime) return;
    setActionLoading("stop-runtime");
    setErrorMsg(null);
    try {
      await bridge.stopRuntime(selectedRuntime.runtimeId);
      await loadProjectData();
      setSuccessMsg("Runtime stopped successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to stop runtime");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestartRuntime = async () => {
    if (!selectedRuntime) return;
    setActionLoading("restart-runtime");
    setErrorMsg(null);
    try {
      await bridge.restartRuntime(selectedRuntime.runtimeId);
      await loadProjectData();
      setSuccessMsg("Runtime restarted with new generation");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to restart runtime");
    } finally {
      setActionLoading(null);
    }
  };

  // Handlers for LSP Actions
  const handleRestartLsp = async () => {
    setActionLoading("restart-lsp");
    setErrorMsg(null);
    try {
      const res = await bridge.restartLspServer(projectId);
      setLspStatus(res.status);
      setSuccessMsg("LSP language server restarted");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to restart LSP server");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStopLsp = async () => {
    setActionLoading("stop-lsp");
    setErrorMsg(null);
    try {
      await bridge.stopLspServer(projectId);
      setLspStatus(null);
      setSuccessMsg("LSP server stopped");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to stop LSP server");
    } finally {
      setActionLoading(null);
    }
  };

  // Worktree removal handler
  const handleRemoveWorktree = async (worktreeId: string) => {
    setActionLoading(`remove-worktree-${worktreeId}`);
    setWorktreeSafetyWarning(null);
    try {
      await bridge.removeWorktree(worktreeId);
      await loadProjectData();
      setSuccessMsg("Worktree removed safely");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setWorktreeSafetyWarning(
        `Cannot remove worktree: ${err.message || "Contains uncommitted changes or active process."}`
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.stream}] ${l.text}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  if (!project) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-4 text-center">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-theme-muted hover:text-theme-primary transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Projects</span>
        </button>
        <div className="text-theme-muted text-sm py-12">Loading project details...</div>
      </div>
    );
  }

  const activeSession = sessions.find((s) => s.state === "active");
  const isRuntimeRunning = selectedRuntime?.state === "running";

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto select-none">
      {/* 1. Header & Navigation Back */}
      <div className="space-y-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-mono text-theme-muted hover:text-sky-400 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Projects</span>
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-theme-primary tracking-tight">
                {project.name}
              </h2>
              <span className="font-mono text-xs text-theme-muted">{project.id}</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  project.enabled
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                }`}
              >
                {project.enabled ? "AUTHORIZED" : "DISABLED"}
              </span>
            </div>
            <div className="text-xs font-mono text-theme-secondary bg-[#080c14] px-2.5 py-1 rounded border border-white/[0.06] inline-block select-all">
              {project.root}
            </div>
          </div>

          {/* Quick Settings Bar in Header */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleAccess}
              disabled={actionLoading === "access"}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition ${
                project.accessMode === "read-write"
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                  : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
              }`}
              title="Toggle Read-Only / Read-Write mode"
            >
              Mode: {project.accessMode === "read-write" ? "Read/Write" : "Read-Only"}
            </button>

            <select
              value={project.executionMode}
              onChange={(e) =>
                handleChangeExecution(
                  e.target.value as "disabled" | "safe-only" | "project-code"
                )
              }
              disabled={actionLoading === "execution"}
              className="bg-[#080c14] border border-white/[0.08] text-xs font-mono text-theme-secondary rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
            >
              <option value="safe-only">Exec: Safe-Only</option>
              <option value="project-code">Exec: Project-Code</option>
              <option value="disabled">Exec: Disabled</option>
            </select>

            <button
              onClick={handleToggleEnable}
              disabled={actionLoading === "enable"}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                project.enabled
                  ? "bg-white/[0.04] text-theme-secondary border-white/[0.08] hover:bg-white/[0.08]"
                  : "bg-emerald-600 text-white border-emerald-500"
              }`}
            >
              {project.enabled ? "Disable" : "Enable"}
            </button>

            {deleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRemoveProject}
                  disabled={actionLoading === "remove"}
                  className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition"
                >
                  Confirm Remove
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-2 py-1.5 text-xs text-theme-muted hover:text-theme-primary transition"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="p-1.5 rounded-lg text-theme-muted hover:text-red-400 hover:bg-white/[0.06] transition"
                title="Remove project authorization"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {errorMsg && (
        <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 2. Top Status Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card A: Persistent Runtime Summary */}
        <div className="p-4 rounded-xl bg-[#0d1320] border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-theme-primary flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-sky-400" />
              <span>Persistent Runtime</span>
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                isRuntimeRunning
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
              }`}
            >
              {isRuntimeRunning ? "RUNNING" : "STOPPED"}
            </span>
          </div>
          <div className="text-[11px] font-mono text-theme-muted space-y-1">
            <div>
              PID: <span className="text-theme-secondary">{selectedRuntime?.pid || "—"}</span>
            </div>
            <div>
              Generation: <span className="text-theme-secondary">Gen {selectedRuntime?.generation || 1}</span>
            </div>
            <div>
              Port:{" "}
              {selectedRuntime?.listeningPorts?.[0] ? (
                <a
                  href={`http://localhost:${selectedRuntime.listeningPorts[0]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:underline"
                >
                  http://localhost:{selectedRuntime.listeningPorts[0]}
                </a>
              ) : (
                <span className="text-theme-secondary">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Card B: Code Intelligence (LSP) Summary */}
        <div className="p-4 rounded-xl bg-[#0d1320] border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-theme-primary flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-indigo-400" />
              <span>Code Intelligence</span>
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                lspStatus?.status === "ready"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
              }`}
            >
              {lspStatus?.status?.toUpperCase() || "STOPPED"}
            </span>
          </div>
          <div className="text-[11px] font-mono text-theme-muted space-y-1">
            <div>
              Engine: <span className="text-theme-secondary">TypeScript LSP (Bundled)</span>
            </div>
            <div>
              PID: <span className="text-theme-secondary">{lspStatus?.pid || "—"}</span>
            </div>
            <div>
              Restarts: <span className="text-theme-secondary">{lspStatus?.restartCount || 0}</span>
            </div>
          </div>
        </div>

        {/* Card C: Active Workflow Session */}
        <div className="p-4 rounded-xl bg-[#0d1320] border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-theme-primary flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-sky-400" />
              <span>Active Workflow</span>
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                activeSession
                  ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                  : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
              }`}
            >
              {activeSession ? "ACTIVE" : "IDLE"}
            </span>
          </div>
          <div className="text-[11px] font-mono text-theme-muted space-y-1">
            <div className="truncate">
              Title:{" "}
              <span className="text-theme-secondary">
                {activeSession?.title || "No active session"}
              </span>
            </div>
            <div>
              Checkpoints:{" "}
              <span className="text-theme-secondary">
                {activeSession?.checkpointCount || 0} checkpoints
              </span>
            </div>
            <div>
              Workspace:{" "}
              <span className="text-theme-secondary">
                {activeSession?.workspace?.mode === "worktree"
                  ? `worktree (${activeSession.workspace.branchName})`
                  : "primary repository"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Deep Persistent Runtime Controller & Quiet Log Viewer */}
      <section className="p-5 rounded-xl bg-[#0d1320] border border-white/[0.06] space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-400" />
              <span>Persistent Runtime Controller</span>
            </h3>
            <p className="text-xs text-theme-muted">
              Live stdout/stderr stream, generation lifecycle, and non-blocking process restart.
            </p>
          </div>

          {/* Runtime Control Actions */}
          <div className="flex items-center gap-2">
            {/* Generation Switcher */}
            {selectedRuntime && selectedRuntime.generation > 1 && (
              <div className="flex items-center gap-1 text-xs font-mono text-theme-muted">
                <span>Gen:</span>
                <select
                  value={selectedGen}
                  onChange={(e) => setSelectedGen(Number(e.target.value))}
                  className="bg-[#080c14] border border-white/[0.08] text-xs font-mono rounded px-2 py-1 text-theme-secondary focus:outline-none"
                >
                  {Array.from({ length: selectedRuntime.generation }, (_, i) => i + 1).map(
                    (gen) => (
                      <option key={gen} value={gen}>
                        Gen {gen} {gen === selectedRuntime.generation ? "(Current)" : ""}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            {isRuntimeRunning ? (
              <button
                onClick={handleStopRuntime}
                disabled={actionLoading === "stop-runtime"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 transition disabled:opacity-50"
              >
                {actionLoading === "stop-runtime" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                <span>Stop Runtime</span>
              </button>
            ) : null}

            <button
              onClick={handleRestartRuntime}
              disabled={actionLoading === "restart-runtime"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition disabled:opacity-50"
            >
              {actionLoading === "restart-runtime" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>Safe Restart (New Gen)</span>
            </button>
          </div>
        </div>

        {/* Quiet Terminal Log Viewer */}
        <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-[#05070d]">
          {/* Terminal Toolbar */}
          <div className="px-4 py-2 bg-[#080b14] border-b border-white/[0.04] flex items-center justify-between text-[11px] font-mono text-theme-muted">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>
                {selectedRuntime
                  ? `${selectedRuntime.runtimeId} · Gen ${selectedGen}`
                  : "No active runtime registered"}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-theme-secondary transition">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded bg-black border-white/20 text-sky-500 focus:ring-0 w-3 h-3"
                />
                <span>Auto-scroll</span>
              </label>

              <button
                onClick={handleCopyLogs}
                className="flex items-center gap-1 hover:text-theme-secondary transition"
              >
                {copiedLogs ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedLogs ? "Copied" : "Copy Logs"}</span>
              </button>

              <button
                onClick={() => setLogs([])}
                className="hover:text-theme-secondary transition"
              >
                Clear View
              </button>
            </div>
          </div>

          {/* Terminal Output Area */}
          <div
            ref={logContainerRef}
            className="p-4 h-64 overflow-y-auto font-mono text-xs leading-relaxed space-y-0.5 text-slate-300 select-text"
          >
            {logs.length === 0 ? (
              <div className="text-slate-600 italic">
                {selectedRuntime
                  ? `[Generation ${selectedGen}] Waiting for runtime output stream...`
                  : "No persistent runtime has been created for this project yet. Start a development server via MCP to begin monitoring."}
              </div>
            ) : (
              logs.map((chunk, idx) => (
                <div
                  key={`${chunk.seq}-${idx}`}
                  className={`whitespace-pre-wrap break-all ${
                    chunk.stream === "stderr" ? "text-amber-400/90" : "text-slate-300"
                  }`}
                >
                  <span className="text-slate-600 select-none text-[10px] mr-2">
                    {new Date(chunk.timestamp).toLocaleTimeString()}
                  </span>
                  {chunk.text}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 4. Workflow Task Trajectory & Checkpoints */}
      <section className="p-5 rounded-xl bg-[#0d1320] border border-white/[0.06] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-400" />
              <span>Workflow Task Trajectory</span>
            </h3>
            <p className="text-xs text-theme-muted">
              Structured agent sessions, checkpoint summaries, and handoff packets.
            </p>
          </div>

          {activeSession && (
            <button
              onClick={() => setSelectedSessionForModal(activeSession)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm"
            >
              Open Full Session Handoff
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="p-6 rounded-lg bg-[#070b13] border border-white/[0.04] text-center text-xs text-theme-muted">
            No workflow sessions recorded for this project yet. AI agent tasks will generate checkpoints and timelines here automatically.
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                onClick={() => setSelectedSessionForModal(sess)}
                className="p-4 rounded-lg bg-[#070b13] border border-white/[0.04] hover:border-white/[0.1] transition cursor-pointer flex items-center justify-between"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-theme-primary truncate">
                      {sess.title || `Session ${sess.id.slice(0, 8)}`}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        sess.state === "active"
                          ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                          : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
                      }`}
                    >
                      {sess.state.toUpperCase()}
                    </span>
                    {sess.workspace?.mode === "worktree" && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        worktree: {sess.workspace.branchName}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-theme-muted flex items-center gap-3">
                    <span>{sess.checkpointCount} checkpoints</span>
                    <span>&bull;</span>
                    <span>{sess.eventCount} operations</span>
                    <span>&bull;</span>
                    <span>
                      Started: {new Date(sess.startedAt).toLocaleDateString()}{" "}
                      {new Date(sess.startedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <button className="text-xs text-theme-muted hover:text-theme-primary font-mono transition">
                  Details ›
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Managed Worktree Inspector (If active worktree exists) */}
      {activeSession?.workspace && activeSession.workspace.mode === "worktree" && (() => {
        const wt = activeSession.workspace;
        return (
          <section className="p-5 rounded-xl bg-[#0d1320] border border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-theme-primary">
                  Active Managed Worktree
                </h3>
              </div>
              <button
                onClick={() => handleRemoveWorktree(wt.worktreeId)}
                disabled={actionLoading?.startsWith("remove-worktree")}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 transition"
              >
                Safe Remove Worktree
              </button>
            </div>

            <div className="p-3 bg-[#070b13] rounded-lg border border-white/[0.04] text-xs font-mono space-y-1.5 text-theme-secondary">
              <div>
                Branch: <span className="text-amber-300">{wt.branchName}</span>
              </div>
              <div>
                Path: <span className="text-theme-muted">{wt.worktreeRoot}</span>
              </div>
              <div>
                Clean State:{" "}
                <span className={wt.isClean ? "text-emerald-400" : "text-amber-400"}>
                  {wt.isClean ? "Clean" : "Modified Files Present"}
                </span>
              </div>
            </div>

            {worktreeSafetyWarning && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{worktreeSafetyWarning}</span>
              </div>
            )}
          </section>
        );
      })()}

      {/* 6. Code Intelligence (LSP) Engine Card */}
      <section className="p-5 rounded-xl bg-[#0d1320] border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-400" />
              <span>TypeScript Language Server</span>
            </h3>
            <p className="text-xs text-theme-muted">
              Bundled TypeScript language server providing symbol lookup, diagnostics, and hover references for AI.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRestartLsp}
              disabled={actionLoading === "restart-lsp"}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-theme-secondary border border-white/[0.06] transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart LSP</span>
            </button>
            {lspStatus && lspStatus.status !== "stopped" && (
              <button
                onClick={handleStopLsp}
                disabled={actionLoading === "stop-lsp"}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-2.5 rounded bg-[#070b13] border border-white/[0.04]">
            <div className="text-[10px] text-theme-muted">Status</div>
            <div className="text-emerald-400 font-semibold mt-0.5">
              {lspStatus?.status?.toUpperCase() || "READY"}
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#070b13] border border-white/[0.04]">
            <div className="text-[10px] text-theme-muted">Engine</div>
            <div className="text-theme-secondary mt-0.5">Bundled TS LSP</div>
          </div>
          <div className="p-2.5 rounded bg-[#070b13] border border-white/[0.04]">
            <div className="text-[10px] text-theme-muted">PID</div>
            <div className="text-theme-secondary mt-0.5">{lspStatus?.pid || "—"}</div>
          </div>
          <div className="p-2.5 rounded bg-[#070b13] border border-white/[0.04]">
            <div className="text-[10px] text-theme-muted">Restarts</div>
            <div className="text-theme-secondary mt-0.5">{lspStatus?.restartCount || 0}</div>
          </div>
        </div>
      </section>

      {/* Session Detail Modal */}
      {selectedSessionForModal && (
        <SessionDetailModal
          isOpen={true}
          onClose={() => {
            setSelectedSessionForModal(null);
            loadProjectData();
          }}
          session={selectedSessionForModal}
          onRefresh={loadProjectData}
        />
      )}
    </div>
  );
};
