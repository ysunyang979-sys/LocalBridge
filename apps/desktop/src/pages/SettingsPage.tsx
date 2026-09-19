import React, { useState } from "react";
import { ShieldCheck, Check, RotateCcw } from "lucide-react";
import { bridge } from "../api/bridge.js";

interface SettingsPageProps {
  onRefresh: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onRefresh }) => {
  const [serverUrl, setServerUrl] = useState(bridge.getBaseUrl());
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    bridge.setBaseUrl(serverUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  const handleReset = () => {
    bridge.setBaseUrl("http://127.0.0.1:18080");
    setServerUrl("http://127.0.0.1:18080");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Application Settings</h2>
        <p className="text-xs text-slate-400">
          Configure LocalBridge server connectivity and review security guarantees.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Server Connection */}
        <form onSubmit={handleSave} className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Server Connection</h3>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              LocalBridge Core Server URL
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Must be a loopback URL (127.0.0.1 or localhost) on port 18080.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
            >
              {saved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Saved</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>
          </div>
        </form>

        {/* Right Column: Security Architecture Summary */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Security Architecture Guarantees</span>
          </div>

          <ul className="space-y-2 text-slate-300 list-disc list-inside">
            <li>
              <strong>Loopback Isolation:</strong> Administrative APIs are restricted exclusively to loopback interfaces.
            </li>
            <li>
              <strong>External AI Sandbox:</strong> MCP AI clients cannot manage projects, create tokens, or self-approve operations.
            </li>
            <li>
              <strong>Human-in-the-Loop Approvals:</strong> Sensitive operations require interactive user approval with 5-minute timeout and SHA-256 parameter hash binding.
            </li>
            <li>
              <strong>Killswitch Controls:</strong> Global Pause and Emergency Stop kill background processes immediately.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
