import React from "react";
import { FileText, CheckCircle2, XCircle, Clock, RotateCw } from "lucide-react";
import type { AuditEvent } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface ActivityPageProps {
  events: AuditEvent[];
  onRefresh: () => void;
}

export const ActivityPage: React.FC<ActivityPageProps> = ({ events, onRefresh }) => {
  const { t } = useTranslation();

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-theme-primary">{t.activity.title}</h2>
          <p className="text-xs text-theme-muted">{t.activity.subtitle}</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-medium transition"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>{t.common.refresh}</span>
        </button>
      </div>

      {events.length === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
          <FileText className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">{t.activity.noActivity}</div>
          <p className="text-theme-muted text-xs">{t.activity.noActivityDesc}</p>
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
                className="p-3 bg-theme-card border border-theme-card rounded-lg flex items-center justify-between gap-4 text-xs font-mono shadow-sm"
              >
                <div className="flex items-center gap-3">
                  {isError ? (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  ) : isSuccess ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-theme-muted shrink-0" />
                  )}
                  <span className="font-semibold text-theme-primary">{evt.toolName}</span>
                  <span className="text-theme-muted text-[11px]">{evt.event}</span>
                  {evt.projectId && (
                    <span className="text-indigo-500 text-[11px]">
                      [{evt.projectId}]
                    </span>
                  )}
                  {evt.errorCode && (
                    <span className="badge badge-red text-[10px]">{evt.errorCode}</span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-theme-muted text-[11px]">
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
