import React, { useState } from "react";
import {
  PauseCircle,
  PlayCircle,
  OctagonAlert,
  RefreshCw,
  Zap,
  Shield,
  AlertTriangle,
  X,
} from "lucide-react";
import type { McpStatus, ApprovalRoutingMode } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface HeaderProps {
  title: string;
  subtitle?: string;
  mcpStatus: McpStatus | null;
  approvalRoutingMode: ApprovalRoutingMode;
  onChangeApprovalRoutingMode: (mode: ApprovalRoutingMode) => Promise<void>;
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
  approvalRoutingMode,
  onChangeApprovalRoutingMode,
  onTogglePause,
  onTriggerEmergencyStop,
  onRefreshAll,
  isRefreshing,
  serverAvailable,
  lastSuccessfulRefresh,
}) => {
  const { t } = useTranslation();
  const isPaused = mcpStatus?.paused ?? false;
  const isAutoTrusted = approvalRoutingMode === "auto-trusted";
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const handleQuickToggle = () => {
    if (isAutoTrusted) {
      // Switch back to safe mode (chat) without needing confirmation
      setIsSwitching(true);
      onChangeApprovalRoutingMode("chat").finally(() => setIsSwitching(false));
    } else {
      // Prompt confirmation before entering auto-execute mode
      setShowConfirmModal(true);
    }
  };

  const handleConfirmAutoExecute = async () => {
    setIsSwitching(true);
    try {
      await onChangeApprovalRoutingMode("auto-trusted");
      setShowConfirmModal(false);
    } finally {
      setIsSwitching(false);
    }
  };

  // Human-readable mode label and styling
  const getModeBadge = () => {
    switch (approvalRoutingMode) {
      case "auto-trusted":
        return {
          label: t.settings.modeAutoTrusted,
          className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
          icon: <Zap className="w-3 h-3 text-amber-400" />,
        };
      case "desktop":
        return {
          label: t.settings.modeDesktop,
          className: "bg-slate-500/15 text-slate-300 border-slate-500/30",
          icon: <Shield className="w-3 h-3 text-slate-400" />,
        };
      case "chat":
      default:
        return {
          label: t.settings.modeChat.replace(/\s*\(.*?\)/, ""),
          className: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
          icon: <Shield className="w-3 h-3 text-indigo-400" />,
        };
    }
  };

  const modeBadge = getModeBadge();

  return (
    <>
      <header className="h-16 px-6 bg-theme-header backdrop-blur border-b border-theme-subtle flex items-center justify-between transition-colors duration-200">
        <div>
          <h1 className="text-lg font-semibold text-theme-primary">{title}</h1>
          {subtitle && <p className="text-xs text-theme-muted">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          {/* Approval Mode Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${modeBadge.className}`}
            title={`${t.settings.approvalRoutingGroup}: ${modeBadge.label}`}
          >
            {modeBadge.icon}
            <span>{modeBadge.label}</span>
          </div>

          {/* Quick Toggle Button: Safe Mode / Auto-execute */}
          <button
            onClick={handleQuickToggle}
            disabled={isSwitching}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shadow-sm ${
              isAutoTrusted
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30"
                : "bg-theme-card border-theme-card text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover"
            }`}
            title={
              isAutoTrusted
                ? t.settings.quickToggleSafeMode
                : t.settings.quickToggleAutoExecute
            }
          >
            {isAutoTrusted ? (
              <>
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.settings.quickToggleSafeMode}</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.settings.quickToggleAutoExecute}</span>
              </>
            )}
          </button>

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

      {/* Risk Confirmation Modal for Auto-execute Mode */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-theme-card border border-theme-card rounded-xl max-w-md w-full shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-amber-500 font-semibold text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{t.settings.autoExecuteModalTitle}</span>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-theme-muted hover:text-theme-primary p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-theme-secondary leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-lg p-3.5">
              {t.settings.autoExecuteModalText}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-theme-secondary hover:bg-theme-card-hover border border-theme-subtle transition"
              >
                {t.settings.autoExecuteCancelBtn}
              </button>
              <button
                type="button"
                disabled={isSwitching}
                onClick={handleConfirmAutoExecute}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow transition flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{t.settings.autoExecuteConfirmBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
