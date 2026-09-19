import React, { useState } from "react";
import { X, OctagonAlert, AlertTriangle } from "lucide-react";
import { bridge } from "../../api/bridge.js";

interface EmergencyStopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (info: { cancelledJobsCount: number; jobIds: string[] }) => void;
}

export const EmergencyStopModal: React.FC<EmergencyStopModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState("Emergency stop triggered by user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bridge.emergencyStop(reason);
      onSuccess({
        cancelledJobsCount: res.cancelledJobsCount,
        jobIds: res.jobIds,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to trigger emergency stop");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-red-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Red Title Banner */}
        <div className="px-6 py-4 bg-red-950/60 border-b border-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-red-300 font-bold text-base">
            <OctagonAlert className="w-5 h-5 text-red-500" />
            <span>Confirm Emergency Stop</span>
          </div>
          <button
            onClick={onClose}
            className="text-red-400 hover:text-red-200 p-1 rounded-lg hover:bg-red-900/40 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-xs text-red-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-slate-300 leading-relaxed">
            Triggering Emergency Stop will immediately:
          </p>

          <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside bg-slate-950 p-3 rounded-lg border border-slate-800">
            <li>
              <strong className="text-red-400">Pause AI Access:</strong> All incoming and pending MCP requests will be immediately blocked.
            </li>
            <li>
              <strong className="text-red-400">Terminate Active Jobs:</strong> Every running shell command, test, or build process will be forcefully terminated via process tree kill.
            </li>
          </ul>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Reason for Audit Log
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleConfirm}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/50 transition active:scale-95 disabled:opacity-50"
            >
              {loading ? "Stopping..." : "FORCE EMERGENCY STOP"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
