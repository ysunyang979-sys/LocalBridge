import React, { useState } from "react";
import {
  PauseCircle,
  PlayCircle,
  OctagonAlert,
  RefreshCw,
  Zap,
  Shield,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import type { McpStatus, ApprovalRoutingMode } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
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
  breadcrumb,
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const handleSelectMode = async (mode: ApprovalRoutingMode) => {
    setShowModeDropdown(false);
    if (mode === "auto-trusted" && approvalRoutingMode !== "auto-trusted") {
      setShowConfirmModal(true);
      return;
    }
    setIsSwitching(true);
    try {
      await onChangeApprovalRoutingMode(mode);
    } finally {
      setIsSwitching(false);
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
          label: t.settings.modeAutoTrusted || "Auto-execute",
          className: "bg-amber-500/10 text-amber-300 border-amber-500/30",
          icon: <Zap className="w-3 h-3 text-amber-400" />,
        };
      case "desktop":
        return {
          label: t.settings.modeDesktop || "Desktop Only",
          className: "bg-slate-500/10 text-slate-300 border-slate-500/30",
          icon: <Shield className="w-3 h-3 text-slate-400" />,
        };
      case "chat":
      default:
        return {
          label: t.settings.modeChat ? t.settings.modeChat.replace(/\s*\(.*?\)/, "") : "Safe (Chat)",
          className: "bg-sky-500/10 text-sky-300 border-sky-500/30",
          icon: <Shield className="w-3 h-3 text-sky-400" />,
        };
    }
  };

  const modeBadge = getModeBadge();

  return (
    <>
      <header className="h-16 px-6 bg-theme-header backdrop-blur border-b border-theme-subtle flex items-center justify-between select-none transition-colors duration-150 relative z-10">
        {/* Left: View Title & Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-widest text-theme-muted">
                Nexus Control
              </span>
              {breadcrumb && (
                <>
                  <span className="text-theme-muted/40 text-xs">/</span>
                  <span className="text-xs font-medium text-sky-500 dark:text-sky-400 font-mono">
                    {breadcrumb}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-base font-semibold text-theme-primary leading-tight truncate">
              {title}
            </h1>
          </div>
          {subtitle && (
            <span className="hidden lg:inline-block text-xs text-theme-muted truncate max-w-sm pl-2 border-l border-theme-subtle">
              {subtitle}
            </span>
          )}
        </div>

        {/* Right: Controls & Global Status */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Global System Health Pill */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
              !serverAvailable
                ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
                : isPaused
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                !serverAvailable
                  ? "bg-red-500"
                  : isPaused
                    ? "bg-amber-500 animate-pulse"
                    : "bg-emerald-500"
              }`}
            />
            <span>
              {!serverAvailable
                ? (t.control?.serverOffline || "OFFLINE")
                : isPaused
                  ? (t.control?.mcpPaused || "AI PAUSED")
                  : (t.control?.serverOnline || "SYSTEM READY")}
            </span>
          </div>

          {/* Mode Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              disabled={isSwitching}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${modeBadge.className} hover:bg-theme-card-hover`}
              title={t.settings?.approvalRoutingGroup || "Change approval routing mode"}
            >
              {modeBadge.icon}
              <span className="font-mono text-[11px]">{modeBadge.label}</span>
              <SlidersHorizontal className="w-3 h-3 ml-0.5 text-theme-muted" />
            </button>

            {showModeDropdown && (
              <div className="absolute right-0 mt-1.5 w-56 bg-theme-card border border-theme-subtle rounded-lg shadow-xl py-1 z-50 text-xs">
                <div className="px-3 py-1.5 text-[10px] uppercase font-mono tracking-wider text-theme-muted border-b border-theme-subtle">
                  {t.settings?.approvalRoutingGroup || "Approval Policy Mode"}
                </div>
                <button
                  onClick={() => handleSelectMode("chat")}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-theme-card-hover ${
                    approvalRoutingMode === "chat" ? "text-sky-500 dark:text-sky-400 font-medium" : "text-theme-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                    <span>{t.settings?.modeChat || "Safe (Chat Approval)"}</span>
                  </div>
                  {approvalRoutingMode === "chat" && <span className="text-[10px]">✓</span>}
                </button>
                <button
                  onClick={() => handleSelectMode("auto-trusted")}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-theme-card-hover ${
                    approvalRoutingMode === "auto-trusted" ? "text-amber-500 dark:text-amber-400 font-medium" : "text-theme-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                    <span>{t.settings?.modeAutoTrusted || "Auto-Execute"}</span>
                  </div>
                  {approvalRoutingMode === "auto-trusted" && <span className="text-[10px]">✓</span>}
                </button>
                <button
                  onClick={() => handleSelectMode("desktop")}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-theme-card-hover ${
                    approvalRoutingMode === "desktop" ? "text-slate-600 dark:text-slate-300 font-medium" : "text-theme-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t.settings?.modeDesktop || "Desktop App Only"}</span>
                  </div>
                  {approvalRoutingMode === "desktop" && <span className="text-[10px]">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Quick Pause / Resume AI Button */}
          <button
            onClick={onTogglePause}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
              isPaused
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
                : "bg-white/[0.04] border-white/[0.06] text-theme-secondary hover:text-theme-primary hover:bg-white/[0.08]"
            }`}
            title={isPaused ? t.overview.resumeAiBtn : t.overview.pauseAiBtn}
          >
            {isPaused ? (
              <>
                <PlayCircle className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">{t.overview.resumeAiBtn || "Resume AI"}</span>
              </>
            ) : (
              <>
                <PauseCircle className="w-3.5 h-3.5 text-theme-muted" />
                <span className="hidden md:inline">{t.overview.pauseAiBtn || "Pause AI"}</span>
              </>
            )}
          </button>

          {/* Emergency Stop Button */}
          <button
            onClick={onTriggerEmergencyStop}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition shadow-sm"
            title={t.overview.emergencyStopBtn || "Emergency Stop"}
          >
            <OctagonAlert className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t.overview.emergencyStopBtn || "Stop"}</span>
          </button>

          {/* Refresh Action */}
          <button
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-white/[0.06] border border-white/[0.06] transition"
            title={
              lastSuccessfulRefresh
                ? `${t.status.lastRefresh}: ${new Date(lastSuccessfulRefresh).toLocaleTimeString()}`
                : t.status.noRefreshYet
            }
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-sky-400" : ""}`}
            />
          </button>
        </div>
      </header>

      {/* Auto-execute Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-card border border-amber-500/30 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500/15 rounded-lg shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-theme-primary">
                  {t.settings.autoExecuteModalTitle || "Enable Auto-Execute Mode?"}
                </h3>
                <p className="text-xs text-theme-secondary leading-relaxed">
                  {t.settings.autoExecuteModalText ||
                    "In Auto-execute mode, caution-level operations requested by AI will be automatically authorized without requiring manual chat confirmation. High-risk operations still follow strict policies."}
                </p>
              </div>
            </div>

            <div className="p-3 bg-theme-card-muted border border-theme-subtle rounded-lg text-[11px] text-theme-muted font-mono space-y-1">
              <div>&bull; Caution commands: Auto-approved</div>
              <div>&bull; Dangerous commands: Still require confirmation</div>
              <div>&bull; You can revert to Safe Mode anytime</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-theme-subtle">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover transition"
              >
                {t.common.cancel || "Cancel"}
              </button>
              <button
                onClick={handleConfirmAutoExecute}
                disabled={isSwitching}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition shadow-sm"
              >
                {t.settings.autoExecuteConfirmBtn || "Confirm Enable"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
