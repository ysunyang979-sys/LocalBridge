import React from "react";
import { Server, Cpu, XCircle, RotateCw } from "lucide-react";
import type { ServerStatus, RunnerInfo } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

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
  const { t } = useTranslation();

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-theme-primary">{t.connections.title}</h2>
          <p className="text-xs text-theme-muted">{t.connections.subtitle}</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-medium transition"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>{t.common.refresh}</span>
        </button>
      </div>

      {/* Server Status Box */}
      <div className="p-5 bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-theme-primary">
            <Server className="w-4 h-4 text-indigo-500" />
            <span>{t.connections.serverSection}</span>
          </div>
          <span
            className={`badge ${serverStatus ? "badge-green" : "badge-red"}`}
          >
            {serverStatus ? t.common.online.toUpperCase() : t.common.offline.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle">
            <div className="text-theme-muted">{t.connections.hostAddress}</div>
            <div className="font-mono text-theme-primary mt-0.5">127.0.0.1:18080</div>
          </div>
          <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle">
            <div className="text-theme-muted">{t.settings.versionLabel}</div>
            <div className="font-semibold text-theme-primary">
              {serverStatus?.version || "1.2.0-P0"}
            </div>
          </div>
          <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle">
            <div className="text-theme-muted">{t.connections.connectedRunnersCount}</div>
            <div className="font-mono text-theme-primary mt-0.5">
              {runners.length}
            </div>
          </div>
          <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle">
            <div className="text-theme-muted">MCP Protocol</div>
            <div className="font-mono text-emerald-500 mt-0.5">2026-07-28</div>
          </div>
        </div>
      </div>

      {/* Runners Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-theme-primary flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <span>{t.connections.runnerSection} ({runners.length})</span>
          </h3>
        </div>

        {runners.length === 0 ? (
          <div className="p-8 text-center bg-theme-card border border-theme-card rounded-xl space-y-3 shadow-sm">
            <XCircle className="w-8 h-8 text-amber-500 mx-auto" />
            <div className="text-theme-primary font-semibold text-sm">
              {t.connections.noRunners}
            </div>
            <p className="text-theme-muted text-xs max-w-md mx-auto">
              {t.connections.noRunnersDesc}
            </p>
            <div className="pt-2 flex justify-center">
              <button
                onClick={onRefresh}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition shadow-sm flex items-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{t.common.refresh}</span>
              </button>
            </div>
            <p className="text-theme-muted text-[11px]">
              {t.connections.daemonNotice}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {runners.map((runner) => (
              <div
                key={runner.id}
                className="p-5 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-theme-primary">{runner.name}</span>
                    <span className="font-mono text-xs text-theme-muted">{runner.id}</span>
                    <span className="badge badge-green">{runner.status.toUpperCase()}</span>
                  </div>
                  <div className="text-xs text-theme-muted font-mono">
                    {runner.platform} ({runner.arch}) &bull; v{runner.version}
                  </div>
                </div>

                {/* Capabilities grid */}
                <div>
                  <div className="text-xs text-theme-muted font-medium mb-1.5">
                    Subsystem Capabilities
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(runner.capabilities || {}).map(([cap, enabled]) => (
                      <span
                        key={cap}
                        className={`badge ${enabled ? "badge-blue" : "badge-amber"}`}
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
