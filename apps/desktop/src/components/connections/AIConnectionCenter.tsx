import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  RefreshCw,
  Server,
  Radio,
  Cpu,
  Star,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Sliders,
} from "lucide-react";
import { bridge, type TunnelStatusDto } from "../../api/bridge.js";
import type {
  AIConnectionDto,
  ProviderPreset,
  AIConnectionConfig,
  ConfigPreviewResult,
  TestConnectionResult,
} from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { AIConnectionCard } from "./AIConnectionCard.js";
import { ConnectionDetailDrawer } from "./ConnectionDetailDrawer.js";
import { ConfigPreviewModal } from "./ConfigPreviewModal.js";
import { AddCustomConnectionModal } from "./AddCustomConnectionModal.js";
import { BUILTIN_CLIENT_CATALOG, mergeCatalogWithSavedConnections } from "./catalog.js";

interface AIConnectionCenterProps {
  tunnelStatus: TunnelStatusDto | null;
  onRefreshAll?: () => void;
  onNavigateToTunnel?: () => void;
}

export const AIConnectionCenter: React.FC<AIConnectionCenterProps> = ({
  tunnelStatus,
  onRefreshAll,
  onNavigateToTunnel,
}) => {
  const { t, language } = useTranslation();
  const isZh = language === "zh-CN";

  // Saved database connections
  const [savedConnections, setSavedConnections] = useState<AIConnectionDto[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [loading, setLoading] = useState(false);

  // Structured Error & Toast states
  const [fetchError, setFetchError] = useState<{ message: string; details?: string } | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  // Mode: standard vs advanced
  const [viewMode, setViewMode] = useState<"standard" | "advanced">("standard");

  // Testing & Applying state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Selected Connection for Drawer
  const [selectedConnection, setSelectedConnection] = useState<AIConnectionDto | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Config Preview Modal State
  const [previewData, setPreviewData] = useState<ConfigPreviewResult | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTargetConn, setPreviewTargetConn] = useState<AIConnectionDto | null>(null);

  // Add Custom Connection Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Primary AI Change Modal
  const [isChangePrimaryOpen, setIsChangePrimaryOpen] = useState(false);

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      if (onRefreshAll) {
        onRefreshAll();
      }
      const [connRes, presetRes] = await Promise.allSettled([
        bridge.listAiConnections(),
        bridge.getAiPresets(),
      ]);

      if (connRes.status === "fulfilled") {
        setSavedConnections(connRes.value.connections || []);
      } else {
        const reason = connRes.reason;
        const msg = reason?.message || String(reason) || "Network or authorization error";
        setFetchError({
          message: t.aiConnections?.failedToLoad || "无法加载已保存的连接配置",
          details: msg,
        });
      }

      if (presetRes.status === "fulfilled") {
        setPresets(presetRes.value.presets || []);
      }
    } finally {
      setLoading(false);
    }
  }, [onRefreshAll, t.aiConnections?.failedToLoad]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setToastError(msg);
      setTimeout(() => setToastError(null), 5000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  // Permanently merged connections: Built-in catalog + saved database connections
  const allConnections = useMemo(() => {
    return mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, savedConnections, tunnelStatus);
  }, [savedConnections, tunnelStatus]);

  // Primary AI logic
  const primaryConnection = useMemo(() => {
    return allConnections.find((c) => c.isPrimary) || allConnections[0] || null;
  }, [allConnections]);

  const handleSetPrimary = async (id: string) => {
    try {
      await bridge.setPrimaryAiConnection(id);
      await fetchConnections();
      showNotification(`${t.aiConnections?.primaryAi || "主 AI"}: ${id} ${t.common.saved}`);
      setIsChangePrimaryOpen(false);
    } catch (err: any) {
      showNotification(err?.message || "Failed to set primary AI", true);
    }
  };

  // Test Connection
  const handleTestConnection = async (id: string): Promise<TestConnectionResult> => {
    setTestingId(id);
    try {
      const res = await bridge.testAiConnection(id);
      if (res.success) {
        showNotification(res.message || t.aiConnections?.testSuccess);
      } else {
        showNotification(res.message || t.aiConnections?.testFailed, true);
      }
      await fetchConnections();
      return res;
    } catch (err: any) {
      const failRes: TestConnectionResult = {
        success: false,
        stage: "ping",
        latencyMs: 0,
        toolCount: 0,
        message: err?.message || (isZh ? "连接测试失败" : "Connection test failed"),
        error: String(err),
      };
      showNotification(failRes.message, true);
      return failRes;
    } finally {
      setTestingId(null);
    }
  };

  // Rotate Token
  const handleRotateToken = async (id: string, scopes?: string[]) => {
    try {
      const res = await bridge.rotateAiConnectionToken(id, scopes);
      await fetchConnections();
      if (selectedConnection && selectedConnection.id === id) {
        setSelectedConnection((prev: AIConnectionDto | null) =>
          prev ? { ...prev, tokenId: res.tokenId } : null
        );
      }
      showNotification(t.aiConnections?.tokenRotated || "令牌已重新生成");
    } catch (err: any) {
      showNotification(err?.message || "Failed to rotate token", true);
    }
  };

  // Config Preview & Apply
  const handleTriggerPreview = async (conn: AIConnectionDto) => {
    setPreviewTargetConn(conn);
    try {
      const preview = await bridge.previewAiConnectionConfig(conn.id);
      setPreviewData(preview);
      setIsPreviewOpen(true);
    } catch (err: any) {
      showNotification(err?.message || "Failed to preview client config", true);
    }
  };

  const handleConfirmApplyConfig = async () => {
    if (!previewTargetConn) return;
    setApplyingId(previewTargetConn.id);
    try {
      const result = await bridge.applyAiConnectionConfig(previewTargetConn.id);
      if (result.success) {
        showNotification(t.aiConnections?.applySuccess || "配置写入成功");
        setIsPreviewOpen(false);
        await fetchConnections();
      } else {
        showNotification(result.message || t.aiConnections?.applyFailed, true);
      }
    } catch (err: any) {
      showNotification(err?.message || "Failed to apply config", true);
    } finally {
      setApplyingId(null);
    }
  };

  // Save Config from drawer
  const handleSaveConfig = async (config: AIConnectionConfig) => {
    try {
      const updated = await bridge.saveAiConnection(config);
      await fetchConnections();
      setSelectedConnection(updated);
      showNotification(t.common.saved);
    } catch (err: any) {
      showNotification(err?.message || "Failed to save configuration", true);
    }
  };

  // Delete Connection
  const handleDeleteConnection = async (id: string) => {
    if (!confirm(t.aiConnections?.deleteConfirm || "确定要删除此连接配置吗？")) {
      return;
    }
    try {
      await bridge.deleteAiConnection(id);
      setIsDrawerOpen(false);
      setSelectedConnection(null);
      await fetchConnections();
      showNotification(t.common.delete + " " + t.common.success);
    } catch (err: any) {
      showNotification(err?.message || "Failed to delete connection", true);
    }
  };

  // Add Custom Connection
  const handleAddCustomConnection = async (config: AIConnectionConfig) => {
    setIsSubmittingAdd(true);
    try {
      await bridge.saveAiConnection(config);
      await fetchConnections();
      showNotification(t.common.success);
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Categorized collections
  const connectedConnections = useMemo(() => {
    return allConnections.filter((c) => c.status === "connected");
  }, [allConnections]);

  const nativeMcpConnections = useMemo(() => {
    return allConnections.filter((c) => c.category === "native-mcp");
  }, [allConnections]);

  const toolAdapterConnections = useMemo(() => {
    return allConnections.filter((c) => c.category === "tool-adapter");
  }, [allConnections]);

  return (
    <div className="max-w-6xl space-y-6 animate-fade-in pb-12">
      {/* Toast Notifications */}
      {toastError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{toastError}</span>
          </div>
          <button onClick={() => setToastError(null)} className="opacity-70 hover:opacity-100">
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="opacity-70 hover:opacity-100">
            &times;
          </button>
        </div>
      )}

      {/* Non-Blocking Error Banner */}
      {fetchError && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs space-y-2 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <span className="font-bold">{fetchError.message}</span>
                <span className="opacity-80 ml-2">
                  {isZh
                    ? "内置客户端目录仍可正常浏览与配置"
                    : "Built-in clients catalog remains available for configuration"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchConnections}
                disabled={loading}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 border border-amber-500/40 transition flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                <span>{t.aiConnections?.retry || "重试"}</span>
              </button>
              {fetchError.details && (
                <button
                  type="button"
                  onClick={() => setShowErrorDetails(!showErrorDetails)}
                  className="px-2 py-1 text-xs font-medium rounded-lg text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 transition flex items-center gap-1"
                >
                  <span>
                    {showErrorDetails
                      ? (t.aiConnections?.hideErrorDetails || "隐藏详情")
                      : (t.aiConnections?.viewErrorDetails || "查看详情")}
                  </span>
                  {showErrorDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
          {showErrorDetails && fetchError.details && (
            <div className="mt-2 p-2.5 rounded-lg bg-black/10 dark:bg-black/30 font-mono text-[11px] text-amber-950 dark:text-amber-100 break-all border border-amber-500/20">
              {fetchError.details}
            </div>
          )}
        </div>
      )}

      {/* Top Banner & Control Plane Header */}
      <div className="p-5 bg-theme-card border border-theme-subtle rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-theme-primary tracking-tight">
                  {t.aiConnections?.title || "AI 连接中心"}
                </h1>
                <p className="text-xs text-theme-muted mt-0.5">
                  {t.aiConnections?.subtitle ||
                    "Model-Agnostic 本地 AI 控制面：统一管理 Native MCP 客户端与 Tool Calling 适配器"}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions & Mode Switcher */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Mode Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-theme-card-muted border border-theme-subtle text-xs">
              <button
                type="button"
                onClick={() => setViewMode("standard")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
                  viewMode === "standard"
                    ? "bg-theme-card text-theme-primary shadow-xs font-semibold"
                    : "text-theme-muted hover:text-theme-primary"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{t.aiConnections?.modeStandard || "标准模式"}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("advanced")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
                  viewMode === "advanced"
                    ? "bg-theme-card text-theme-primary shadow-xs font-semibold"
                    : "text-theme-muted hover:text-theme-primary"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{t.aiConnections?.modeAdvanced || "高级模式"}</span>
              </button>
            </div>

            {onNavigateToTunnel && (
              <button
                type="button"
                onClick={onNavigateToTunnel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition"
                title={t.tunnel?.cardTitle || "Tunnel"}
              >
                <Radio className="w-3.5 h-3.5 text-sky-400" />
                <span>{t.tunnel?.cardTitle || "Tunnel"}</span>
                {tunnelStatus?.status === "Connected" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>
            )}

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.aiConnections?.addCustomConnection || "添加连接"}</span>
            </button>

            <button
              onClick={fetchConnections}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition disabled:opacity-50"
              title={t.common.refresh}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{t.common.refresh}</span>
            </button>
          </div>
        </div>

        {/* Primary AI Selector Bar */}
        <div className="pt-3.5 border-t border-theme-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 fill-amber-500 text-amber-500 shrink-0" />
            <span className="font-semibold text-theme-primary">
              {t.aiConnections?.primaryAi || "当前主 AI 客户端"}:
            </span>
            <span className="text-theme-muted">
              {t.aiConnections?.primaryAiDesc ||
                "设置默认日常交互的 AI 助手。主客户端优先接收审批事件并高亮展示。"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-theme-card-muted border border-theme-subtle text-theme-primary font-semibold text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              {primaryConnection ? primaryConnection.name : "ChatGPT"}
            </span>

            <button
              type="button"
              onClick={() => setIsChangePrimaryOpen(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition"
            >
              {t.aiConnections?.changePrimary || "更改"}
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 1: Connected Clients (Active) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-bold text-theme-primary uppercase tracking-wider">
              {t.aiConnections?.connectedSection || "已连接的 AI 客户端"} ({connectedConnections.length})
            </h2>
          </div>
        </div>

        {connectedConnections.length === 0 ? (
          <div className="p-5 rounded-2xl bg-theme-card border border-dashed border-theme-subtle text-center space-y-1.5">
            <div className="text-xs font-semibold text-theme-primary">
              {t.aiConnections?.noConnectedClients || "暂无活跃连接的 AI 客户端"}
            </div>
            <p className="text-[11px] text-theme-muted max-w-md mx-auto">
              {t.aiConnections?.noConnectedClientsDesc ||
                "从下方选择可用客户端一键生成配置或填入 API Key 即可快速接入 Nexus 本地控制面。"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {connectedConnections.map((conn) => (
              <AIConnectionCard
                key={conn.id}
                connection={conn}
                mode={viewMode}
                isPrimary={Boolean(conn.isPrimary)}
                onSetPrimary={handleSetPrimary}
                onTest={handleTestConnection}
                onOpenDetails={(c) => {
                  setSelectedConnection(c);
                  setIsDrawerOpen(true);
                }}
                onApplyConfig={handleTriggerPreview}
                onOpenTunnel={onNavigateToTunnel}
                isTesting={testingId === conn.id}
                isApplying={applyingId === conn.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: Available Native Clients (Native MCP) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Server className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-theme-primary uppercase tracking-wider">
              {t.aiConnections?.availableClientsSection || "可用原生客户端 (Native MCP)"}
            </h2>
            <p className="text-[11px] text-theme-muted">
              {t.aiConnections?.categoryDescNativeMcp ||
                "支持 Model Context Protocol 规范，通过本地 HTTP/Streamable 或安全隧道直连"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {nativeMcpConnections.map((conn) => (
            <AIConnectionCard
              key={conn.id}
              connection={conn}
              mode={viewMode}
              isPrimary={Boolean(conn.isPrimary)}
              onSetPrimary={handleSetPrimary}
              onTest={handleTestConnection}
              onOpenDetails={(c) => {
                setSelectedConnection(c);
                setIsDrawerOpen(true);
              }}
              onApplyConfig={handleTriggerPreview}
              onOpenTunnel={onNavigateToTunnel}
              isTesting={testingId === conn.id}
              isApplying={applyingId === conn.id}
            />
          ))}
        </div>
      </div>

      {/* SECTION 3: API Models & Tool Adapters (DeepSeek & OpenAI-compatible) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-theme-primary uppercase tracking-wider">
              {t.aiConnections?.apiModelsSection || "API 模型与工具适配器 (Tool/API Adapters)"}
            </h2>
            <p className="text-[11px] text-theme-muted">
              {t.aiConnections?.categoryDescToolAdapter ||
                "标准 Function Calling 接口，Nexus 负责工具映射并统一执行本地安全控制"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {toolAdapterConnections.map((conn) => (
            <AIConnectionCard
              key={conn.id}
              connection={conn}
              mode={viewMode}
              isPrimary={Boolean(conn.isPrimary)}
              onSetPrimary={handleSetPrimary}
              onTest={handleTestConnection}
              onOpenDetails={(c) => {
                setSelectedConnection(c);
                setIsDrawerOpen(true);
              }}
              onApplyConfig={handleTriggerPreview}
              onOpenTunnel={onNavigateToTunnel}
              isTesting={testingId === conn.id}
              isApplying={applyingId === conn.id}
            />
          ))}
        </div>
      </div>

      {/* Primary AI Change Modal */}
      {isChangePrimaryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-theme-card border border-theme-subtle rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <h3 className="text-sm font-bold text-theme-primary">
                  {t.aiConnections?.changePrimaryModalTitle || "选择默认主 AI 客户端"}
                </h3>
              </div>
              <button
                onClick={() => setIsChangePrimaryOpen(false)}
                className="text-theme-muted hover:text-theme-primary text-xs"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {allConnections.map((c) => {
                const isSelected = primaryConnection?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSetPrimary(c.id)}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition ${
                      isSelected
                        ? "bg-sky-500/10 border-sky-500/40 text-sky-600 dark:text-sky-400 font-semibold"
                        : "bg-theme-card-muted border-theme-subtle text-theme-secondary hover:border-theme-hover"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-xs">{c.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-theme-card text-theme-muted border border-theme-subtle">
                        {c.category === "native-mcp" ? "Native MCP" : "Tool Adapter"}
                      </span>
                    </div>
                    {isSelected && <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-theme-subtle flex justify-end">
              <button
                type="button"
                onClick={() => setIsChangePrimaryOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-theme-secondary hover:text-theme-primary bg-theme-card-muted hover:bg-theme-card-hover border border-theme-subtle transition"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection Detail Drawer */}
      <ConnectionDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedConnection(null);
        }}
        connection={selectedConnection}
        isPrimary={selectedConnection?.id === primaryConnection?.id}
        onSetPrimary={handleSetPrimary}
        onRotateToken={handleRotateToken}
        onTestConnection={handleTestConnection}
        onSaveConfig={handleSaveConfig}
        onDeleteConnection={handleDeleteConnection}
        onPreviewConfig={handleTriggerPreview}
      />

      {/* Config Preview & Apply Modal */}
      <ConfigPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewData(null);
        }}
        preview={previewData}
        clientName={previewTargetConn?.name || ""}
        onConfirmApply={handleConfirmApplyConfig}
        isApplying={Boolean(applyingId)}
      />

      {/* Add Custom Connection Modal */}
      <AddCustomConnectionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        presets={presets}
        onSubmit={handleAddCustomConnection}
        isSubmitting={isSubmittingAdd}
      />
    </div>
  );
};
