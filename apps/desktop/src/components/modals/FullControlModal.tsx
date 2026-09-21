import React, { useState } from "react";
import { X, ShieldAlert, AlertTriangle, Clock, HardDrive, FolderGit2, Check } from "lucide-react";
import { bridge } from "../../api/bridge.js";
import type { FullControlSession, FullControlScope, AIConnectionDto } from "../../types.js";

interface FullControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStarted: (session: FullControlSession) => void;
  currentProjectId?: string;
  currentProjectName?: string;
  connections?: AIConnectionDto[];
  primaryClientId?: string;
}

export const FullControlModal: React.FC<FullControlModalProps> = ({
  isOpen,
  onClose,
  onStarted,
  currentProjectId,
  currentProjectName,
  connections = [],
  primaryClientId,
}) => {
  const [scope, setScope] = useState<FullControlScope>("current-project");
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [confirmedDevice, setConfirmedDevice] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine initial client ID
  const activeClients = connections.filter((c) => c.status === "connected" || c.status === "configured");
  const defaultClient =
    primaryClientId || (activeClients.length > 0 ? activeClients[0].id : "conn_chatgpt");
  const [selectedClientId, setSelectedClientId] = useState<string>(defaultClient);

  if (!isOpen) return null;

  const handleStart = async () => {
    if (scope === "device" && !confirmedDevice) {
      setError("请勾选设备完全控制确认选项");
      return;
    }
    if (scope === "current-project" && !currentProjectId) {
      setError("当前没有打开任何项目，请选择项目或切换为设备控制");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await bridge.startFullControl({
        clientId: selectedClientId,
        scope,
        projectId: scope === "current-project" ? currentProjectId : undefined,
        durationMinutes,
        confirmedDeviceFullControl: scope === "device" ? confirmedDevice : undefined,
      });
      onStarted(res.session);
      onClose();
    } catch (err: any) {
      setError(err.message || "开启完全控制失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-theme-card border border-amber-500/40 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-amber-500 font-bold text-base">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <span>开启 Nexus 完全控制模式 (Full Control)</span>
          </div>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-primary p-1 rounded-lg hover:bg-theme-card-hover transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Description */}
          <div className="text-xs text-theme-secondary leading-relaxed space-y-1">
            <p>
              完全控制模式为选定的 AI 客户端提供<strong>临时免审批执行权限</strong>
              ，允许其完成项目清空、递归删除目录（如 node_modules/、hexo-blog/）、删除二进制文件等底层操作。
            </p>
          </div>

          {/* Client Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-theme-primary">
              授权 AI 客户端
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full bg-theme-bg border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-amber-500"
            >
              {connections.length > 0 ? (
                connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.clientType})
                  </option>
                ))
              ) : (
                <option value="conn_chatgpt">ChatGPT (Default Client)</option>
              )}
            </select>
          </div>

          {/* Scope Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-theme-primary">
              授权范围控制
            </label>
            <div className="grid grid-cols-1 gap-2.5">
              {/* Option 1: Current Project */}
              <div
                onClick={() => setScope("current-project")}
                className={`p-3.5 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                  scope === "current-project"
                    ? "bg-amber-500/10 border-amber-500/50 text-theme-primary"
                    : "bg-theme-bg border-theme-subtle text-theme-secondary hover:border-theme-muted"
                }`}
              >
                <FolderGit2
                  className={`w-5 h-5 mt-0.5 shrink-0 ${
                    scope === "current-project" ? "text-amber-500" : "text-theme-muted"
                  }`}
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">当前项目完全控制</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-mono">
                      推荐
                    </span>
                  </div>
                  <p className="text-[11px] text-theme-muted leading-relaxed">
                    仅限于当前已授权项目：
                    <strong className="text-theme-primary">
                      {currentProjectName || currentProjectId || "未选定项目"}
                    </strong>
                    。支持强制清理所有子目录与二进制文件。
                  </p>
                </div>
              </div>

              {/* Option 2: This Device */}
              <div
                onClick={() => setScope("device")}
                className={`p-3.5 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                  scope === "device"
                    ? "bg-red-500/10 border-red-500/50 text-theme-primary"
                    : "bg-theme-bg border-theme-subtle text-theme-secondary hover:border-theme-muted"
                }`}
              >
                <HardDrive
                  className={`w-5 h-5 mt-0.5 shrink-0 ${
                    scope === "device" ? "text-red-500" : "text-theme-muted"
                  }`}
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">整台设备完全控制</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-500 font-mono">
                      高危
                    </span>
                  </div>
                  <p className="text-[11px] text-theme-muted leading-relaxed">
                    允许 AI 操作本机文件系统。Nexus 核心程序、数据库和系统关键路径依然强制受保护。
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Confirmation for Device Scope */}
          {scope === "device" && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedDevice}
                  onChange={(e) => setConfirmedDevice(e.target.checked)}
                  className="mt-0.5 rounded border-red-500/50 text-red-600 focus:ring-red-500"
                />
                <span className="text-xs text-red-400 font-semibold leading-relaxed">
                  我理解这将允许 AI 操作此设备上的文件
                </span>
              </label>
              <p className="text-[11px] text-red-300/80 pl-6">
                请确认您信任此 AI 客户端。随时可点击顶部“紧急制动”立即中断。
              </p>
            </div>
          )}

          {/* Duration Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-theme-primary">
              <Clock className="w-3.5 h-3.5 text-theme-muted" />
              <span>生效时长 (Session Duration)</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "15 分钟", val: 15 },
                { label: "30 分钟", val: 30 },
                { label: "1 小时", val: 60 },
                { label: "手动关闭", val: 0 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setDurationMinutes(item.val)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition ${
                    durationMinutes === item.val
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-500 font-bold"
                      : "bg-theme-bg border-theme-subtle text-theme-secondary hover:bg-theme-card-hover"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Safety Notice Bullets */}
          <div className="p-3 bg-theme-bg border border-theme-subtle rounded-lg text-[11px] text-theme-muted space-y-1.5">
            <div className="flex items-center gap-1.5 text-theme-secondary font-semibold">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>安全原则与保护边界</span>
            </div>
            <div>&bull; 临时会话提权：到期后自动恢复普通安全策略，不改写数据库令牌。</div>
            <div>&bull; 多客户端隔离：仅对所选客户端生效，其余客户端不受影响。</div>
            <div>&bull; 紧急制动最高级：Emergency Stop 随时可一键撤销完全控制。</div>
            <div>&bull; 符号链接保护：递归删除遇到软链接/Junction 仅解除链接本身，绝不跨越。</div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-theme-header border-t border-theme-subtle flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-theme-secondary hover:text-theme-primary rounded-lg hover:bg-theme-card-hover transition"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={loading || (scope === "device" && !confirmedDevice)}
            className={`px-5 py-2 text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5 ${
              scope === "device" && !confirmedDevice
                ? "bg-theme-card-muted text-theme-muted cursor-not-allowed"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }`}
          >
            {loading ? "开启中..." : "开启完全控制"}
          </button>
        </div>
      </div>
    </div>
  );
};
