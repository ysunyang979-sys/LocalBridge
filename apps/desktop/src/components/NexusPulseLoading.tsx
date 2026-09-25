import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Radio, Server, Cpu, ShieldCheck } from "lucide-react";

interface NexusPulseLoadingProps {
  isReady: boolean;
  tunnelConnected: boolean;
  runnerConnected: boolean;
  mcpActive: boolean;
  toolsCount?: number;
}

export const NexusPulseLoading: React.FC<NexusPulseLoadingProps> = ({
  isReady,
  tunnelConnected,
  runnerConnected,
  mcpActive,
  toolsCount,
}) => {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (isReady && tunnelConnected && runnerConnected && mcpActive) {
      const timer = setTimeout(() => {
        setFading(true);
        const hideTimer = setTimeout(() => {
          setVisible(false);
        }, 400);
        return () => clearTimeout(hideTimer);
      }, 1200);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
      setFading(false);
    }
  }, [isReady, tunnelConnected, runnerConnected, mcpActive]);

  if (!visible) return null;

  const steps = [
    {
      id: "tunnel",
      label: "Secure Tunnel",
      icon: Radio,
      done: tunnelConnected,
    },
    {
      id: "runner",
      label: "Local Runner",
      icon: Cpu,
      done: runnerConnected,
    },
    {
      id: "mcp",
      label: `MCP Tools (${toolsCount ?? 87})`,
      icon: Server,
      done: mcpActive,
    },
    {
      id: "ready",
      label: "Quiet Core",
      icon: ShieldCheck,
      done: isReady,
    },
  ];

  return (
    <div
      className={`w-full bg-[#060910]/95 border-b border-white/[0.06] px-4 py-1.5 flex items-center justify-between text-[11px] select-none transition-opacity duration-300 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
        <span className="font-mono text-theme-muted tracking-wider uppercase text-[10px]">
          Nexus Pulse Initialization
        </span>
      </div>

      <div className="flex items-center gap-6">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div key={step.id} className="flex items-center gap-1.5 font-mono">
              {step.done ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <Loader2 className="w-3 h-3 text-sky-400 animate-spin shrink-0" />
              )}
              <Icon className="w-3 h-3 text-theme-muted shrink-0" />
              <span
                className={
                  step.done
                    ? "text-theme-secondary"
                    : "text-sky-300 font-medium"
                }
              >
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <span className="text-white/20 ml-2">›</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[10px] font-mono text-theme-muted">
        {isReady ? "READY" : "CONNECTING"}
      </div>
    </div>
  );
};
