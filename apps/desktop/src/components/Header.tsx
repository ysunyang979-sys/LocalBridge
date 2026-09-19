import React from "react";
import { PauseCircle, PlayCircle, OctagonAlert, RefreshCw } from "lucide-react";
import type { McpStatus } from "../types.js";

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
  const isPaused = mcpStatus?.paused ?? false;

  return (
    <header className="h-16 px-6 bg-slate-900/80 backdrop-blur border-b border-slate-800 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`text-[11px] ${serverAvailable ? "text-emerald-400" : "text-red-400"}`}
          title={lastSuccessfulRefresh ? `Last successful refresh: ${new Date(lastSuccessfulRefresh).toLocaleString()}` : "No successful refresh yet"}
        >
          {serverAvailable ? "Online" : "Unavailable"}
        </span>
        {/* Refresh button */}
        <button
          onClick={onRefreshAll}
          disabled={isRefreshing}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-indigo-400" : ""}`} />
        </button>

        {/* Global Pause Button */}
        <button
          onClick={onTogglePause}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition shadow-sm ${
            isPaused
              ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
              : "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
          }`}
        >
          {isPaused ? (
            <>
              <PlayCircle className="w-4 h-4 text-amber-400" />
              <span>Resume AI Access</span>
            </>
          ) : (
            <>
              <PauseCircle className="w-4 h-4 text-slate-400" />
              <span>Pause AI Access</span>
            </>
          )}
        </button>

        {/* Emergency Stop Button */}
        <button
          onClick={onTriggerEmergencyStop}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600/90 hover:bg-red-600 text-white border border-red-500 shadow-sm shadow-red-950 transition active:scale-95"
        >
          <OctagonAlert className="w-4 h-4" />
          <span>Emergency Stop</span>
        </button>
      </div>
    </header>
  );
};
