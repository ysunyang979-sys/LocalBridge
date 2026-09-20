import React, { useState, useEffect, useRef } from "react";
import {
  Terminal,
  XCircle,
  RotateCw,
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
} from "lucide-react";
import type { Job, JobLogChunk } from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface JobsPageProps {
  jobs: Job[];
  onRefresh: () => void;
}

type FilterTab = "all" | "running" | "failed";

export const JobsPage: React.FC<JobsPageProps> = ({ jobs, onRefresh }) => {
  const { t, translateError } = useTranslation();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Log viewer state
  const [logs, setLogs] = useState<JobLogChunk[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch logs whenever expandedJobId changes
  useEffect(() => {
    if (!expandedJobId) {
      setLogs([]);
      return;
    }

    let isMounted = true;
    const fetchLogs = async () => {
      try {
        setLoadingLogs(true);
        const res = await bridge.getJobLogs(expandedJobId, null, 200);
        if (isMounted) {
          setLogs(res.chunks || []);
        }
      } catch {
        // ignore log fetch failure
      } finally {
        if (isMounted) setLoadingLogs(false);
      }
    };

    void fetchLogs();

    // Auto-poll if job is running
    const targetJob = jobs.find((j) => j.jobId === expandedJobId);
    let interval: NodeJS.Timeout | undefined;
    if (targetJob && (targetJob.state === "running" || targetJob.state === "queued")) {
      interval = setInterval(async () => {
        try {
          const res = await bridge.getJobLogs(expandedJobId, null, 200);
          if (isMounted) {
            setLogs(res.chunks || []);
          }
        } catch {
          // ignore
        }
      }, 1500);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [expandedJobId, jobs]);

  // Handle auto-scroll
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const handleCancel = async (jobId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCancellingId(jobId);
    setError(null);
    try {
      await bridge.cancelJob(jobId);
      onRefresh();
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setCancellingId(null);
    }
  };

  const handleCopyLogs = async () => {
    const text = logs.map((l) => l.text).join("");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleClearView = () => {
    setLogs([]);
  };

  const toggleExpand = (jobId: string) => {
    setExpandedJobId((prev) => (prev === jobId ? null : jobId));
  };

  const getJobBadge = (state: string) => {
    switch (state) {
      case "running":
        return (
          <span className="badge badge-blue flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            {t.jobs.running}
          </span>
        );
      case "queued":
        return (
          <span className="badge badge-purple flex items-center gap-1">
            <PauseCircle className="w-3 h-3" />
            {t.jobs.queued}
          </span>
        );
      case "succeeded":
        return (
          <span className="badge badge-green flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {t.jobs.completed}
          </span>
        );
      case "failed":
        return (
          <span className="badge badge-red flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            {t.jobs.failed}
          </span>
        );
      case "cancelled":
        return (
          <span className="badge badge-amber flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            {t.jobs.cancelled}
          </span>
        );
      case "timed-out":
      case "timed_out":
        return (
          <span className="badge badge-amber flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {t.jobs.timedOut}
          </span>
        );
      case "interrupted":
        return (
          <span className="badge badge-red flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {t.jobs.interrupted}
          </span>
        );
      default:
        return <span className="badge badge-blue">{state}</span>;
    }
  };

  // Filter jobs based on active tab
  const filteredJobs = jobs.filter((j) => {
    if (activeTab === "running") {
      return j.state === "running" || j.state === "queued";
    }
    if (activeTab === "failed") {
      return (
        j.state === "failed" ||
        j.state === "timed-out" ||
        j.state === "timed_out" ||
        j.state === "interrupted"
      );
    }
    return true;
  });

  const runningCount = jobs.filter((j) => j.state === "running" || j.state === "queued").length;
  const failedCount = jobs.filter(
    (j) =>
      j.state === "failed" ||
      j.state === "timed-out" ||
      j.state === "timed_out" ||
      j.state === "interrupted"
  ).length;

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-theme-primary">{t.jobs.title}</h2>
          <p className="text-xs text-theme-muted">{t.jobs.subtitle}</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-medium transition shadow-sm"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>{t.common.refresh}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-theme-card pb-2">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === "all"
              ? "bg-theme-accent text-white shadow-sm"
              : "text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover"
          }`}
        >
          {t.jobs.tabAll} ({jobs.length})
        </button>
        <button
          onClick={() => setActiveTab("running")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
            activeTab === "running"
              ? "bg-theme-accent text-white shadow-sm"
              : "text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover"
          }`}
        >
          <span>{t.jobs.tabRunning}</span>
          {runningCount > 0 && (
            <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 rounded-full text-[10px] font-bold">
              {runningCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("failed")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
            activeTab === "failed"
              ? "bg-theme-accent text-white shadow-sm"
              : "text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover"
          }`}
        >
          <span>{t.jobs.tabFailed}</span>
          {failedCount > 0 && (
            <span className="px-1.5 py-0.2 bg-red-500/20 text-red-300 rounded-full text-[10px] font-bold">
              {failedCount}
            </span>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-500">
          {error}
        </div>
      )}

      {filteredJobs.length === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
          <Terminal className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">{t.jobs.noJobs}</div>
          <p className="text-theme-muted text-xs">{t.jobs.noJobsDesc}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => {
            const isRunning = job.state === "running" || job.state === "queued";
            const isExpanded = expandedJobId === job.jobId;
            const created = new Date(job.createdAt);

            return (
              <div
                key={job.jobId}
                className={`bg-theme-card border rounded-xl overflow-hidden shadow-sm transition ${
                  isExpanded
                    ? "border-theme-accent/50 shadow-md"
                    : "border-theme-card hover:border-theme-subtle"
                }`}
              >
                {/* Main Card Header */}
                <div
                  onClick={() => toggleExpand(job.jobId)}
                  className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none hover:bg-theme-card-hover transition"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="text-theme-muted">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-theme-accent" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getJobBadge(job.state)}
                        <span className="text-xs font-mono font-bold text-theme-primary">
                          {job.jobId}
                        </span>
                        {job.commandKind && (
                          <span className="px-2 py-0.5 rounded bg-theme-card-muted text-theme-muted text-[10px] font-mono">
                            {job.commandKind}
                          </span>
                        )}
                        <span className="text-xs text-theme-muted">
                          {t.jobs.project}:{" "}
                          <span className="text-theme-secondary font-medium">
                            {job.projectId}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-theme-muted font-mono flex-wrap">
                        <span>{created.toLocaleTimeString()}</span>
                        <span>
                          {t.jobs.duration}:{" "}
                          {job.durationMs
                            ? `${(job.durationMs / 1000).toFixed(1)}s`
                            : isRunning
                            ? t.jobs.running
                            : "-"}
                        </span>
                        {job.exitCode !== undefined && job.exitCode !== null && (
                          <span
                            className={
                              job.exitCode === 0
                                ? "text-emerald-500 font-semibold"
                                : "text-red-500 font-semibold"
                            }
                          >
                            {t.jobs.exitCode}: {job.exitCode}
                          </span>
                        )}
                        {job.outputTruncated && (
                          <span className="text-amber-500 flex items-center gap-1 text-[11px]">
                            <AlertTriangle className="w-3 h-3" />
                            Truncated
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isRunning && (
                      <button
                        onClick={(e) => handleCancel(job.jobId, e)}
                        disabled={cancellingId === job.jobId}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-500 border border-red-500/30 rounded-lg text-xs font-semibold transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>
                          {cancellingId === job.jobId ? t.common.loading : t.jobs.cancelBtn}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details & Live Logs Stream */}
                {isExpanded && (
                  <div className="border-t border-theme-card bg-theme-card-muted/50 p-4 space-y-4">
                    {/* Job Details Meta Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-theme-card p-3 rounded-lg border border-theme-subtle">
                      <div>
                        <span className="text-theme-muted block">{t.jobs.project}</span>
                        <span className="font-mono text-theme-primary font-medium">
                          {job.projectId}
                        </span>
                      </div>
                      <div>
                        <span className="text-theme-muted block">{t.jobs.state}</span>
                        <span className="font-mono text-theme-primary font-medium">
                          {job.state}
                        </span>
                      </div>
                      <div>
                        <span className="text-theme-muted block">Created At</span>
                        <span className="font-mono text-theme-secondary">
                          {new Date(job.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-theme-muted block">Finished At</span>
                        <span className="font-mono text-theme-secondary">
                          {job.finishedAt ? new Date(job.finishedAt).toLocaleString() : "-"}
                        </span>
                      </div>
                    </div>

                    {job.error && (
                      <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-mono">
                        Error: {job.error}
                      </div>
                    )}

                    {job.outputTruncated && (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>{t.jobs.outputTruncatedNotice}</span>
                      </div>
                    )}

                    {/* Terminal Live Logs Viewer */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-theme-muted">
                        <div className="flex items-center gap-2 font-medium text-theme-secondary">
                          <Terminal className="w-3.5 h-3.5" />
                          <span>{t.jobs.logs}</span>
                          {loadingLogs && (
                            <span className="text-[10px] text-theme-muted animate-pulse">
                              (fetching...)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={autoScroll}
                              onChange={(e) => setAutoScroll(e.target.checked)}
                              className="rounded border-theme-subtle text-theme-accent focus:ring-0 w-3.5 h-3.5"
                            />
                            <span>{t.jobs.autoScroll}</span>
                          </label>
                          <button
                            onClick={handleCopyLogs}
                            className="flex items-center gap-1 px-2 py-1 bg-theme-card hover:bg-theme-card-hover border border-theme-subtle rounded text-[11px] font-medium transition"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copied ? "Copied!" : t.jobs.copyLogs}</span>
                          </button>
                          <button
                            onClick={handleClearView}
                            className="flex items-center gap-1 px-2 py-1 bg-theme-card hover:bg-theme-card-hover border border-theme-subtle rounded text-[11px] font-medium text-theme-muted hover:text-red-400 transition"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{t.jobs.clearLogs}</span>
                          </button>
                        </div>
                      </div>

                      <div className="h-64 overflow-y-auto bg-black/90 rounded-lg p-3 font-mono text-[11px] text-neutral-200 border border-neutral-800 shadow-inner space-y-0.5 leading-relaxed select-text">
                        {logs.length === 0 ? (
                          <div className="text-neutral-500 italic p-4 text-center">
                            {loadingLogs ? t.common.loading : t.jobs.noLogs}
                          </div>
                        ) : (
                          logs.map((chunk) => {
                            const isStderr = chunk.stream === "stderr";
                            return (
                              <div
                                key={chunk.seq}
                                className={`whitespace-pre-wrap break-all ${
                                  isStderr ? "text-red-400" : "text-neutral-200"
                                }`}
                              >
                                {chunk.text}
                              </div>
                            );
                          })
                        )}
                        <div ref={logsEndRef} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
