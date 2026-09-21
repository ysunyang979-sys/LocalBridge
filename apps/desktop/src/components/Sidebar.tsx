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
} from "lucide-react";
import type { ServerStatus, McpStatus, TunnelStatusDto } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";
import nexusLogo from "../assets/nexus.png";

export type NavPage =
  | "overview"
  | "projects"
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
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  pendingApprovalsCount,
  serverStatus,
  mcpStatus,
  runnersCount,
  tunnelStatus,
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
      id: "activity" as NavPage,
      label: t.nav.activity || "Activity",
      icon: FileText,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
      badgeColor: "bg-amber-500",
      shortcut: "3",
    },
  ];

  const isSettingsActive = currentPage === "settings";

  return (
    <aside
      className={`bg-theme-sidebar border-r border-theme-subtle flex flex-col justify-between select-none h-screen transition-all duration-200 z-20 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div>
        {/* Brand Header with Nexus Avatar */}
        <div className="h-16 px-3.5 border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={nexusLogo}
              alt="Nexus"
              className="w-8 h-8 rounded-lg shadow-sm object-cover border border-white/10 shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/nexus.png";
              }}
            />
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <div className="font-semibold text-theme-primary text-sm tracking-wide flex items-center gap-1.5">
                  <span>Nexus</span>
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    2.0
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
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
                className={`w-full flex items-center rounded-lg text-xs font-medium transition-all ${
                  collapsed
                    ? "justify-center p-2.5"
                    : "justify-between px-3 py-2"
                } ${
                  active
                    ? "bg-white/[0.08] text-white shadow-sm border border-white/[0.08]"
                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? "text-sky-400" : "text-theme-muted"
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
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
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
              ? "bg-white/[0.08] text-white shadow-sm border border-white/[0.08]"
              : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Settings
              className={`w-4 h-4 shrink-0 ${
                isSettingsActive ? "text-sky-400" : "text-theme-muted"
              }`}
            />
            {!collapsed && (
              <span className="truncate">{t.nav.settings || "Settings"}</span>
            )}
          </div>
        </button>

        {/* System Status Indicators */}
        {!collapsed ? (
          <div className="p-2.5 rounded-lg bg-[#080c14]/70 border border-white/[0.04] text-[11px] space-y-1.5 font-mono">
            <div className="flex items-center justify-between text-theme-muted">
              <span className="flex items-center gap-1.5">
                <Server className="w-3 h-3 text-theme-muted" />
                <span>Control Plane</span>
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    serverStatus ? "bg-emerald-400" : "bg-red-400"
                  }`}
                />
                <span className={serverStatus ? "text-emerald-400" : "text-red-400"}>
                  {serverStatus ? "ONLINE" : "OFFLINE"}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between text-theme-muted">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-theme-muted" />
                <span>Runner</span>
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    effectiveRunnersCount > 0 ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                <span
                  className={
                    effectiveRunnersCount > 0
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }
                >
                  {effectiveRunnersCount > 0
                    ? `${effectiveRunnersCount} CONNECTED`
                    : "0 NODES"}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between text-theme-muted">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-theme-muted" />
                <span>Tunnel</span>
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isTunnelConnected ? "bg-emerald-400" : "bg-slate-500"
                  }`}
                />
                <span
                  className={
                    isTunnelConnected ? "text-emerald-400" : "text-slate-400"
                  }
                >
                  {isTunnelConnected ? "LINKED" : "STANDBY"}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between text-theme-muted">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-theme-muted" />
                <span>MCP Tools</span>
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    mcpStatus?.paused
                      ? "bg-amber-400"
                      : mcpStatus?.mcpActive
                        ? "bg-emerald-400"
                        : "bg-red-400"
                  }`}
                />
                <span
                  className={
                    mcpStatus?.paused
                      ? "text-amber-400"
                      : mcpStatus?.mcpActive
                        ? "text-emerald-400"
                        : "text-red-400"
                  }
                >
                  {mcpStatus?.paused
                    ? "PAUSED"
                    : `${mcpStatus?.toolsCount || 55} READY`}
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <span
              title={`Control Plane: ${serverStatus ? "ONLINE" : "OFFLINE"}`}
              className={`w-2 h-2 rounded-full ${
                serverStatus ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            <span
              title={`Runner: ${effectiveRunnersCount} connected`}
              className={`w-2 h-2 rounded-full ${
                effectiveRunnersCount > 0 ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span
              title={`Tunnel: ${isTunnelConnected ? "LINKED" : "STANDBY"}`}
              className={`w-2 h-2 rounded-full ${
                isTunnelConnected ? "bg-emerald-400" : "bg-slate-500"
              }`}
            />
            <span
              title={`MCP: ${mcpStatus?.paused ? "PAUSED" : "ACTIVE"}`}
              className={`w-2 h-2 rounded-full ${
                mcpStatus?.paused ? "bg-amber-400" : "bg-emerald-400"
              }`}
            />
          </div>
        )}
      </div>
    </aside>
  );
};
