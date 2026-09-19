import React from "react";
import { PauseCircle, PlayCircle, OctagonAlert, RefreshCw } from "lucide-react";
import type { McpStatus } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface HeaderProps {
  title: string;
  subtitle?: string;
  mcpStatus: McpStatus | null;
  onTogglePause: () => void;
  onTriggerEmergencyStop: () => void;
  onRefreshAll: () => void;
  isRefreshing?: boolean;
  serverAvailable: boolean;
  lastSuccessfulRefresh: number | null;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  mcpStatus,
  onTogglePause,
  onTriggerEmergencyStop,
  onRefreshAll,
  isRefreshing,
  serverAvailable,
  lastSuccessfulRefresh,
}) => {
  const { t } = useTranslation();
  const isPaused = mcpStatus?.paused ?? false;

  return (
    <header className="h-16 px-6 bg-theme-header backdrop-blur border-b border-theme-subtle flex items-center justify-between transition-colors duration-200">
      <div>
        <h1 className="text-lg font-semibold text-theme-primary">{title}</h1>
        {subtitle && <p className="text-xs text-theme-muted">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`text-[11px] font-medium ${serverAvailable ? "text-emerald-500" : "text-red-500"}`}
          title={
            lastSuccessfulRefresh
              ? `${t.status.lastRefresh}: ${new Date(lastSuccessfulRefresh).toLocaleString()}`
              : t.status.noRefreshYet
          }
        >
          {serverAvailable ? t.common.online : t.common.unavailable}
        </span>

        {/* Refresh button */}
        <button
          onClick={onRefreshAll}
          disabled={isRefreshing}
          className="p-2 text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover rounded-lg transition"
          title={t.common.refresh}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`} />
        </button>

        {/* Global Pause Button */}
        <button
          onClick={onTogglePause}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition shadow-sm ${
            isPaused
              ? "bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25"
              : "bg-theme-card border-theme-card text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover"
          }`}
        >
          {isPaused ? (
            <>
              <PlayCircle className="w-4 h-4 text-amber-500" />
              <span>{t.overview.resumeAiBtn}</span>
            </>
          ) : (
            <>
              <PauseCircle className="w-4 h-4 text-theme-muted" />
              <span>{t.overview.pauseAiBtn}</span>
            </>
          )}
        </button>

        {/* Emergency Stop Button */}
        <button
          onClick={onTriggerEmergencyStop}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white border border-red-500 shadow-sm transition active:scale-95"
        >
          <OctagonAlert className="w-4 h-4" />
          <span>{t.overview.emergencyStopBtn}</span>
        </button>
      </div>
    </header>
  );
};
