import React from "react";
import { FileText, CheckCircle2, XCircle, Clock, RotateCw } from "lucide-react";
import type { AuditEvent } from "../types.js";

interface ActivityPageProps {
  events: AuditEvent[];
  onRefresh: () => void;
}

export const ActivityPage: React.FC<ActivityPageProps> = ({ events, onRefresh }) => {
  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Audit & Tool Activity Stream</h2>
          <p className="text-xs text-slate-400">
            Real-time sanitized event log of tool invocations, approvals, and system state transitions.
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

      {events.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="text-slate-300 font-semibold text-sm">No Audit Events</div>
          <p className="text-slate-500 text-xs">
            Tool calls performed by AI clients via MCP will automatically appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((evt) => {
            const isSuccess = evt.resultStatus === "success";
            const isError = evt.resultStatus === "error" || evt.event.includes("failed");
            const time = new Date(evt.timestamp).toLocaleTimeString();

            return (
              <div
                key={evt.id}
                className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between gap-4 text-xs font-mono"
              >
                <div className="flex items-center gap-3">
                  {isError ? (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : isSuccess ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="font-semibold text-slate-200">{evt.toolName}</span>
                  <span className="text-slate-400 text-[11px]">{evt.event}</span>
                  {evt.projectId && (
                    <span className="text-indigo-300 text-[11px]">
                      [{evt.projectId}]
                    </span>
                  )}
                  {evt.errorCode && (
                    <span className="badge badge-red text-[10px]">{evt.errorCode}</span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-slate-400 text-[11px]">
                  {evt.durationMs !== undefined && (
                    <span>{evt.durationMs}ms</span>
                  )}
                  <span>{time}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
