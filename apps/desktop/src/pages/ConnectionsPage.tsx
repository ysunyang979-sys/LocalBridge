import React from "react";
import { Server, Cpu, XCircle, RotateCw } from "lucide-react";
import type { ServerStatus, RunnerInfo } from "../types.js";

interface ConnectionsPageProps {
  serverStatus: ServerStatus | null;
  runners: RunnerInfo[];
  onRefresh: () => void;
}

export const ConnectionsPage: React.FC<ConnectionsPageProps> = ({
  serverStatus,
  runners,
  onRefresh,
}) => {
  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Daemon & Server Connections</h2>
          <p className="text-xs text-slate-400">
            Verify connected local runners, architecture capabilities, and health status.
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

      {/* Server Status Box */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
            <Server className="w-4 h-4 text-indigo-400" />
            <span>LocalBridge Core Server</span>
          </div>
          <span
            className={`badge ${serverStatus ? "badge-green" : "badge-red"}`}
          >
            {serverStatus ? "ONLINE" : "OFFLINE"}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-slate-400">Host / Port</div>
            <div className="font-mono text-slate-200 mt-0.5">127.0.0.1:18080</div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-slate-400">Version</div>
            <div className="font-mono text-slate-200 mt-0.5">
              {serverStatus?.version || "0.11.0"}
            </div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-slate-400">Connected Runners</div>
            <div className="font-mono text-slate-200 mt-0.5">
              {runners.length}
            </div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-slate-400">MCP Protocol</div>
            <div className="font-mono text-emerald-400 mt-0.5">2026-07-28</div>
          </div>
        </div>
      </div>

      {/* Runners Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span>Connected Runner Daemons ({runners.length})</span>
          </h3>
        </div>

        {runners.length === 0 ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
            <XCircle className="w-8 h-8 text-amber-500 mx-auto" />
            <div className="text-slate-300 font-semibold text-sm">
              Local Runner is offline
            </div>
            <p className="text-slate-400 text-xs max-w-md mx-auto">
              The background runner daemon is not connected. LocalBridge Supervisor manages the embedded runner automatically.
            </p>
            <div className="pt-2 flex justify-center">
              <button
                onClick={onRefresh}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
            <p className="text-slate-500 text-[11px]">
              If the problem persists, restart LocalBridge to relaunch the runner daemon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {runners.map((runner) => (
              <div
                key={runner.id}
                className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-100">{runner.name}</span>
                    <span className="font-mono text-xs text-slate-500">{runner.id}</span>
                    <span className="badge badge-green">{runner.status.toUpperCase()}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {runner.platform} ({runner.arch}) &bull; v{runner.version}
                  </div>
                </div>

                {/* Capabilities grid */}
                <div>
                  <div className="text-xs text-slate-400 font-medium mb-1.5">
                    Subsystem Capabilities
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(runner.capabilities || {}).map(([cap, enabled]) => (
                      <span
                        key={cap}
                        className={`badge ${enabled ? "badge-blue" : "badge-gray"}`}
                      >
                        {cap}: {enabled ? "ENABLED" : "DISABLED"}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
