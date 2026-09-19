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
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  pendingApprovalsCount,
  activeJobsCount,
  serverStatus,
  mcpStatus,
}) => {
  const navItems = [
    { id: "overview" as NavPage, label: "Overview", icon: LayoutDashboard },
    { id: "projects" as NavPage, label: "Projects", icon: FolderLock },
    {
      id: "approvals" as NavPage,
      label: "Approvals",
      icon: ShieldAlert,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
      badgeColor: "bg-red-500",
    },
    {
      id: "jobs" as NavPage,
      label: "Jobs",
      icon: Terminal,
      badge: activeJobsCount > 0 ? activeJobsCount : undefined,
      badgeColor: "bg-blue-500",
    },
    { id: "connections" as NavPage, label: "Connections", icon: Activity },
    { id: "tokens" as NavPage, label: "Tokens", icon: KeyRound },
    { id: "activity" as NavPage, label: "Activity", icon: FileText },
    { id: "settings" as NavPage, label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between select-none h-screen">
      <div>
        {/* Branding */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-950">
            LB
          </div>
          <div>
            <div className="font-semibold text-slate-100 text-sm tracking-wide">
              LocalBridge
            </div>
            <div className="text-xs text-slate-400">Desktop Control Center</div>
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
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
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
      <div className="p-4 border-t border-slate-800 bg-slate-950/70 text-xs space-y-2">
        <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
          Service Status
        </div>
        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            Server
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                serverStatus ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            {serverStatus ? "Online" : "Offline"}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            Runners
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                (serverStatus?.runners_connected || 0) > 0
                  ? "bg-emerald-500"
                  : "bg-amber-500"
              }`}
            />
            {serverStatus?.runners_connected || 0} Connected
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-slate-400" />
            MCP (AI Access)
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                mcpStatus?.paused
                  ? "bg-amber-500"
                  : mcpStatus?.mcpActive
                    ? "bg-emerald-500"
                    : "bg-red-500"
              }`}
            />
            {mcpStatus?.paused ? "Paused" : mcpStatus?.mcpActive ? "Active" : "Down"}
          </span>
        </div>
      </div>
    </aside>
  );
};
