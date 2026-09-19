import React from "react";
import {
  LayoutDashboard,
  FolderLock,
  ShieldAlert,
  Terminal,
  Activity,
  KeyRound,
  FileText,
  Settings,
  Radio,
  Server,
  Cpu,
} from "lucide-react";
import type { ServerStatus, McpStatus } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

export type NavPage =
  | "overview"
  | "projects"
  | "approvals"
  | "jobs"
  | "connections"
  | "tokens"
  | "activity"
  | "settings";

interface SidebarProps {
  currentPage: NavPage;
  onSelectPage: (page: NavPage) => void;
  pendingApprovalsCount: number;
  activeJobsCount: number;
  serverStatus: ServerStatus | null;
  mcpStatus: McpStatus | null;
  runnersCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  pendingApprovalsCount,
  activeJobsCount,
  serverStatus,
  mcpStatus,
  runnersCount,
}) => {
  const { t } = useTranslation();

  const effectiveRunnersCount =
    runnersCount !== undefined
      ? runnersCount
      : serverStatus?.runners_connected || 0;

  const navItems = [
    { id: "overview" as NavPage, label: t.nav.overview, icon: LayoutDashboard },
    { id: "projects" as NavPage, label: t.nav.projects, icon: FolderLock },
    {
      id: "approvals" as NavPage,
      label: t.nav.approvals,
      icon: ShieldAlert,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
      badgeColor: "bg-red-500",
    },
    {
      id: "jobs" as NavPage,
      label: t.nav.jobs,
      icon: Terminal,
      badge: activeJobsCount > 0 ? activeJobsCount : undefined,
      badgeColor: "bg-blue-500",
    },
    { id: "connections" as NavPage, label: t.nav.connections, icon: Activity },
    { id: "tokens" as NavPage, label: t.nav.tokens, icon: KeyRound },
    { id: "activity" as NavPage, label: t.nav.activity, icon: FileText },
    { id: "settings" as NavPage, label: t.nav.settings, icon: Settings },
  ];

  return (
    <aside className="w-64 bg-theme-sidebar border-r border-theme-subtle flex flex-col justify-between select-none h-screen transition-colors duration-200">
      <div>
        {/* Branding with New App Icon */}
        <div className="p-4 border-b border-theme-subtle flex items-center gap-3">
          <img
            src="/app-icon.png"
            alt="LocalBridge"
            className="w-9 h-9 rounded-lg shadow-md object-contain bg-slate-900/10 dark:bg-transparent"
            onError={(e) => {
              // Fallback to favicon if app-icon not loaded
              (e.currentTarget as HTMLImageElement).src = "/favicon.png";
            }}
          />
          <div>
            <div className="font-semibold text-theme-primary text-sm tracking-wide">
              LocalBridge
            </div>
            <div className="text-xs text-theme-muted">{t.nav.desktopControlCenter}</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectPage(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full text-white font-bold ${item.badgeColor}`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer System Status */}
      <div className="p-4 border-t border-theme-subtle bg-theme-card-muted/50 text-xs space-y-2">
        <div className="text-theme-muted font-semibold uppercase tracking-wider text-[10px]">
          {t.status.serviceStatus}
        </div>
        <div className="flex items-center justify-between text-theme-secondary">
          <span className="flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-theme-muted" />
            {t.status.server}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                serverStatus ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            {serverStatus ? t.common.online : t.common.offline}
          </span>
        </div>
        <div className="flex items-center justify-between text-theme-secondary">
          <span className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-theme-muted" />
            {t.status.runners}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                effectiveRunnersCount > 0
                  ? "bg-emerald-500"
                  : "bg-amber-500"
              }`}
            />
            {effectiveRunnersCount} {t.common.connected}
          </span>
        </div>
        <div className="flex items-center justify-between text-theme-secondary">
          <span className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-theme-muted" />
            {t.status.mcpAccess}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                mcpStatus?.paused
                  ? "bg-amber-500"
                  : mcpStatus?.mcpActive
                    ? "bg-emerald-500"
                    : "bg-red-500"
              }`}
            />
            {mcpStatus?.paused
              ? t.common.paused
              : mcpStatus?.mcpActive
                ? t.common.active
                : t.common.down}
          </span>
        </div>
      </div>
    </aside>
  );
};
