import React, { useState } from "react";
import { Terminal, XCircle, RotateCw } from "lucide-react";
import type { Job } from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface JobsPageProps {
  jobs: Job[];
  onRefresh: () => void;
}

export const JobsPage: React.FC<JobsPageProps> = ({ jobs, onRefresh }) => {
  const { t, translateError } = useTranslation();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async (jobId: string) => {
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

  const getJobBadge = (state: string) => {
    switch (state) {
      case "running":
        return <span className="badge badge-blue">{t.jobs.running}</span>;
      case "queued":
        return <span className="badge badge-purple">{t.jobs.queued}</span>;
      case "succeeded":
        return <span className="badge badge-green">{t.jobs.completed}</span>;
      case "failed":
        return <span className="badge badge-red">{t.jobs.failed}</span>;
      case "cancelled":
        return <span className="badge badge-amber">{t.jobs.cancelled}</span>;
      case "timed-out":
        return <span className="badge badge-amber">TIMED OUT</span>;
      default:
        return <span className="badge badge-blue">{state}</span>;
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-theme-primary">{t.jobs.title}</h2>
          <p className="text-xs text-theme-muted">{t.jobs.subtitle}</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-medium transition"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>{t.common.refresh}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-500">
          {error}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
          <Terminal className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">{t.jobs.noJobs}</div>
          <p className="text-theme-muted text-xs">{t.jobs.noJobsDesc}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isRunning = job.state === "running" || job.state === "queued";
            const created = new Date(job.createdAt);

            return (
              <div
                key={job.jobId}
                className="p-4 bg-theme-card border border-theme-card rounded-xl flex items-center justify-between gap-4 shadow-sm"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getJobBadge(job.state)}
                    <span className="text-xs font-mono font-bold text-theme-primary">
                      {job.jobId}
                    </span>
                    <span className="text-xs text-theme-muted">
                      {t.jobs.project}: <span className="text-theme-secondary">{job.projectId}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-theme-muted font-mono">
                    <span>{created.toLocaleTimeString()}</span>
                    <span>
                      {t.jobs.duration}:{" "}
                      {job.durationMs
                        ? `${(job.durationMs / 1000).toFixed(1)}s`
                        : t.jobs.running}
                    </span>
                    <span
                      className={
                        job.risk === "DANGEROUS"
                          ? "text-red-500 font-semibold"
                          : job.risk === "CAUTION"
                            ? "text-amber-500 font-semibold"
                            : "text-emerald-500"
                      }
                    >
                      Risk: {job.risk}
                    </span>
                  </div>
                </div>

                <div>
                  {isRunning && (
                    <button
                      onClick={() => handleCancel(job.jobId)}
                      disabled={cancellingId === job.jobId}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-500 border border-red-500/30 rounded-lg text-xs font-semibold transition"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{cancellingId === job.jobId ? t.common.loading : t.jobs.cancelBtn}</span>
                    </button>
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
