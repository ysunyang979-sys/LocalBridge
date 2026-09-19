import React, { useState } from "react";
import { Terminal, XCircle, RotateCw } from "lucide-react";
import type { Job } from "../types.js";
import { bridge } from "../api/bridge.js";

interface JobsPageProps {
  jobs: Job[];
  onRefresh: () => void;
}

export const JobsPage: React.FC<JobsPageProps> = ({ jobs, onRefresh }) => {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async (jobId: string) => {
    setCancellingId(jobId);
    setError(null);
    try {
      await bridge.cancelJob(jobId);
      onRefresh();
    } catch (err: any) {
      setError(err.message || "Failed to cancel job");
    } finally {
      setCancellingId(null);
    }
  };

  const getJobBadge = (state: string) => {
    switch (state) {
      case "running":
        return <span className="badge badge-blue">RUNNING</span>;
      case "queued":
        return <span className="badge badge-purple">QUEUED</span>;
      case "succeeded":
        return <span className="badge badge-green">SUCCEEDED</span>;
      case "failed":
        return <span className="badge badge-red">FAILED</span>;
      case "cancelled":
        return <span className="badge badge-gray">CANCELLED</span>;
      case "timed-out":
        return <span className="badge badge-amber">TIMED OUT</span>;
      default:
        return <span className="badge badge-gray">{state}</span>;
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Jobs & Background Processes</h2>
          <p className="text-xs text-slate-400">
            Monitor and cancel asynchronous commands, builds, and test suites running in local sandboxes.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-300">
          {error}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <Terminal className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="text-slate-300 font-semibold text-sm">No Jobs Recorded</div>
          <p className="text-slate-500 text-xs">
            As AI agents run build and test jobs, they will appear here in real-time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isRunning = job.state === "running" || job.state === "queued";
            const created = new Date(job.createdAt);

            return (
              <div
                key={job.jobId}
                className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getJobBadge(job.state)}
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {job.jobId}
                    </span>
                    <span className="text-xs text-slate-400">
                      Project: <span className="text-slate-200">{job.projectId}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                    <span>Started: {created.toLocaleTimeString()}</span>
                    <span>
                      Duration:{" "}
                      {job.durationMs
                        ? `${(job.durationMs / 1000).toFixed(1)}s`
                        : "Running"}
                    </span>
                    <span
                      className={
                        job.risk === "DANGEROUS"
                          ? "text-red-400"
                          : job.risk === "CAUTION"
                            ? "text-amber-400"
                            : "text-emerald-400"
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
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 rounded-lg text-xs font-semibold transition"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{cancellingId === job.jobId ? "Cancelling..." : "Cancel"}</span>
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
