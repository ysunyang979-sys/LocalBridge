import React, { useState } from "react";
import {
  LayoutDashboard,
  FolderLock,
  FileText,
  Settings,
  Radio,
  Server,
  Cpu,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ServerStatus, McpStatus, TunnelStatusDto, UserExperienceMode } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";
import nexusLogo from "../assets/nexus.png";

export type NavPage =
  | "overview"
  | "projects"
  | "skills"
  | "activity"
  | "settings"
  | "approvals"
  | "jobs"
  | "connections"
  | "tokens";

interface SidebarProps {
  currentPage: NavPage;
  onSelectPage: (page: NavPage) => void;
  pendingApprovalsCount: number;
  activeJobsCount: number;
  serverStatus: ServerStatus | null;
  mcpStatus: McpStatus | null;
  runnersCount?: number;
  tunnelStatus?: TunnelStatusDto | null;
  uxMode?: UserExperienceMode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  pendingApprovalsCount,
  serverStatus,
  mcpStatus,
  runnersCount,
  tunnelStatus,
  uxMode = "standard",
}) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const effectiveRunnersCount =
    runnersCount !== undefined
      ? runnersCount
      : serverStatus?.runners_connected || 0;

  const isTunnelConnected =
    tunnelStatus?.status === "Connected" ||
    tunnelStatus?.control_plane_connected === true;

  // Converged core navigation: Control, Projects, Activity
  const navItems = [
    {
      id: "overview" as NavPage,
      label: t.nav.overview || "Control",
      icon: LayoutDashboard,
      shortcut: "1",
    },
    {
      id: "projects" as NavPage,
      label: t.nav.projects || "Projects",
      icon: FolderLock,
      shortcut: "2",
    },
    {
      id: "skills" as NavPage,
      label: t.nav.skills || "Skills",
      icon: Sparkles,
      shortcut: "3",
    },
    {
      id: "activity" as NavPage,
      label: t.nav.activity || "Activity",
      icon: FileText,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
      badgeColor: "bg-amber-500",
      shortcut: "4",
    },
  ];

  const isSettingsActive = currentPage === "settings";

  return (
    <aside
      className={`bg-theme-sidebar border-r border-theme-subtle flex flex-col justify-between select-none h-screen transition-all duration-200 z-20 ${
        collapsed ? "w-[60px]" : "w-[228px]"
      }`}
    >
      <div>
        {/* Brand Header with single 32x32 Avatar */}
        <div
          className={`border-b border-theme-subtle flex transition-all duration-200 ${
            collapsed
              ? "flex-col items-center py-2.5 gap-2"
              : "h-16 px-3.5 items-center justify-between"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={nexusLogo}
              alt="Nexus"
              className="w-8 h-8 rounded-lg shadow-sm object-cover border border-theme-subtle shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/nexus.png";
              }}
            />
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <div className="font-semibold text-theme-primary text-sm tracking-wide flex items-center gap-1.5">
                  <span>Nexus</span>
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/20">
                    1.2.0
                  </span>
                </div>
                <div className="text-[11px] text-theme-muted truncate">
                  Local AI Control Plane
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
            title={collapsed ? (t.common.expand || "Expand") : (t.common.collapse || "Collapse")}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Primary Navigation */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              currentPage === item.id ||
              (item.id === "activity" && currentPage === "approvals");

            return (
              <button
                key={item.id}
                onClick={() => onSelectPage(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center rounded-lg text-xs font-medium transition-all relative ${
                  collapsed
                    ? "justify-center p-2.5"
                    : "justify-between px-3 py-2"
                } ${
                  active
                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold shadow-sm border border-sky-500/20"
                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? "text-sky-600 dark:text-sky-400" : "text-theme-muted"
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </div>

                {!collapsed && item.badge !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full text-white font-mono font-bold ${item.badgeColor}`}
                  >
                    {item.badge}
                  </span>
                )}

                {collapsed && item.badge !== undefined && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-theme-sidebar" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Area: Settings + Compact Status Strip */}
      <div className="p-2 border-t border-theme-subtle space-y-2">
        {/* Settings button pinned at bottom */}
        <button
          onClick={() => onSelectPage("settings")}
          title={collapsed ? (t.nav.settings || "Settings") : undefined}
          className={`w-full flex items-center rounded-lg text-xs font-medium transition-all ${
            collapsed
              ? "justify-center p-2.5"
              : "justify-between px-3 py-2"
          } ${
            isSettingsActive
              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold shadow-sm border border-sky-500/20"
              : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover border border-transparent"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Settings
              className={`w-4 h-4 shrink-0 ${
                isSettingsActive ? "text-sky-600 dark:text-sky-400" : "text-theme-muted"
              }`}
            />
            {!collapsed && (
              <span className="truncate">{t.nav.settings || "Settings"}</span>
            )}
          </div>
        </button>

        {/* System Status Indicators */}
        {!collapsed ? (
          uxMode === "standard" ? (
            <div className="p-2.5 rounded-lg bg-theme-card-muted border border-theme-subtle text-[11px] font-mono">
              <div className="flex items-center justify-between text-theme-muted">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      serverStatus && effectiveRunnersCount > 0 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <span>
                    {serverStatus && effectiveRunnersCount > 0
                      ? (t.overview?.localServicesHealthy || "System Ready")
                      : (t.overview?.localServicesDegraded || "Degraded")}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-theme-muted">v1.2.0</span>
              </div>
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-theme-card-muted border border-theme-subtle text-[11px] space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-theme-muted">
                <span className="flex items-center gap-1.5">
                  <Server className="w-3 h-3 text-theme-muted" />
                  <span>{t.control?.controlPlane || "Control Plane"}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      serverStatus ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                  <span className={serverStatus ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                    {serverStatus ? (t.control?.serverOnline || "ONLINE") : (t.control?.serverOffline || "OFFLINE")}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between text-theme-muted">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3 h-3 text-theme-muted" />
                  <span>{t.control?.localRunner || "Runner"}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      effectiveRunnersCount > 0 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <span
                    className={
                      effectiveRunnersCount > 0
                        ? "text-emerald-600 dark:text-emerald-400 font-medium"
                        : "text-amber-600 dark:text-amber-400 font-medium"
                    }
                  >
                    {effectiveRunnersCount > 0
                      ? `${effectiveRunnersCount} ${t.control?.runnerConnected || "CONNECTED"}`
                      : (t.control?.runnerZero || "0 NODES")}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between text-theme-muted">
                <span className="flex items-center gap-1.5">
                  <Radio className="w-3 h-3 text-theme-muted" />
                  <span>{t.control?.secureTunnel || "Tunnel"}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isTunnelConnected ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"
                    }`}
                  />
                  <span
                    className={
                      isTunnelConnected ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-500 dark:text-slate-400"
                    }
                  >
                    {isTunnelConnected ? (t.control?.tunnelConnected || "LINKED") : (t.control?.tunnelStandby || "STANDBY")}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between text-theme-muted">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-theme-muted" />
                  <span>{t.control?.mcpProtocol || "MCP Tools"}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      mcpStatus?.paused
                        ? "bg-amber-500"
                        : mcpStatus?.mcpActive
                          ? "bg-emerald-500"
                          : "bg-red-500"
                    }`}
                  />
                  <span
                    className={
                      mcpStatus?.paused
                        ? "text-amber-600 dark:text-amber-400 font-medium"
                        : mcpStatus?.mcpActive
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-red-600 dark:text-red-400 font-medium"
                    }
                  >
                    {mcpStatus?.paused
                      ? (t.control?.mcpPaused || "PAUSED")
                      : `${mcpStatus?.toolsCount ?? 62} ${t.intelligence?.statusReady || "READY"}`}
                  </span>
                </span>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-2.5 py-2">
            <span
              title={`Status: ${serverStatus && effectiveRunnersCount > 0 ? "Ready" : "Degraded"}`}
              className={`w-2 h-2 rounded-full ${
                serverStatus && effectiveRunnersCount > 0 ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {uxMode === "advanced" && (
              <>
                <span
                  title={`Control Plane: ${serverStatus ? "ONLINE" : "OFFLINE"}`}
                  className={`w-2 h-2 rounded-full ${
                    serverStatus ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                <span
                  title={`Runner: ${effectiveRunnersCount} connected`}
                  className={`w-2 h-2 rounded-full ${
                    effectiveRunnersCount > 0 ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                <span
                  title={`Tunnel: ${isTunnelConnected ? "LINKED" : "STANDBY"}`}
                  className={`w-2 h-2 rounded-full ${
                    isTunnelConnected ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"
                  }`}
                />
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
