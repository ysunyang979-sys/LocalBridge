import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  Server,
  Radio,
  Cpu,
  Layers,
  Star,
  CheckCircle2,
  AlertCircle,
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
  const { t } = useTranslation();

  const [connections, setConnections] = useState<AIConnectionDto[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    try {
      if (onRefreshAll) {
        onRefreshAll();
      }
      const [connRes, presetRes] = await Promise.allSettled([
        bridge.listAiConnections(),
        bridge.getAiPresets(),
      ]);

      if (connRes.status === "fulfilled") {
        setConnections(connRes.value.connections || []);
      } else {
        setErrorMsg("Failed to load connections");
      }

      if (presetRes.status === "fulfilled") {
        setPresets(presetRes.value.presets || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 5000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  // Primary AI logic
  const primaryConnection = connections.find((c) => c.isPrimary) || connections[0] || null;

  const handleSetPrimary = async (id: string) => {
    try {
      await bridge.setPrimaryAiConnection(id);
      await fetchConnections();
      showNotification(`${t.aiConnections?.primaryAi || "Primary AI"}: ${id} ${t.common.saved}`);
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
        message: err?.message || "Connection test failed",
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
      showNotification(t.aiConnections?.tokenRotated || "Token regenerated");
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
        showNotification(t.aiConnections?.applySuccess || "Config written successfully");
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
    if (!confirm(t.aiConnections?.deleteConfirm || "Are you sure you want to delete this connection?")) {
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

  // Filter into 4 sections
  const connectedConnections = connections.filter((c) => c.status === "connected");
  const nativeMcpConnections = connections.filter(
    (c) => c.category === "native-mcp" && !["custom-mcp"].includes(c.clientType)
  );
  const toolAdapterConnections = connections.filter(
    (c) => c.category === "tool-adapter" && !["custom-openai"].includes(c.clientType)
  );
  const customConnections = connections.filter(
    (c) => c.clientType === "custom-mcp" || c.clientType === "custom-openai"
  );

  return (
    <div className="max-w-6xl space-y-8 animate-fade-in pb-12">
      {/* Toast Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="opacity-70 hover:opacity-100">
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="opacity-70 hover:opacity-100">
            &times;
          </button>
        </div>
      )}

      {/* Top Banner & Control Plane Header */}
      <div className="p-6 bg-theme-card border border-theme-subtle rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-theme-primary tracking-tight">
                  {t.aiConnections?.title || "AI Connection Center"}
                </h1>
                <p className="text-xs text-theme-muted mt-0.5">
                  {t.aiConnections?.subtitle ||
                    "Model-Agnostic Local AI Control Plane: Native MCP Clients & Tool Calling Adapters"}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
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
              <span>{t.aiConnections?.addCustomConnection || "Add Connection"}</span>
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
        <div className="pt-4 border-t border-theme-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 fill-amber-500 text-amber-500 shrink-0" />
            <span className="font-semibold text-theme-primary">
              {t.aiConnections?.primaryAi || "Primary AI Client"}:
            </span>
            <span className="text-theme-muted">
              {t.aiConnections?.primaryAiDesc ||
                "Default assistant receiving operational approvals with priority."}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={primaryConnection?.id || ""}
              onChange={(e) => handleSetPrimary(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-theme-card-muted border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.category === "native-mcp" ? "Native MCP" : "Tool Adapter"})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 1: Connected Clients (Active) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-bold text-theme-primary uppercase tracking-wider">
              {t.aiConnections?.connectedSection || "Connected AI Clients"} ({connectedConnections.length})
            </h2>
          </div>
        </div>

        {connectedConnections.length === 0 ? (
          <div className="p-6 rounded-2xl bg-theme-card border border-dashed border-theme-subtle text-center space-y-1.5">
            <div className="text-xs font-semibold text-theme-primary">
              {t.aiConnections?.noConnectedClients || "No Active AI Clients Connected"}
            </div>
            <p className="text-[11px] text-theme-muted max-w-md mx-auto">
              {t.aiConnections?.noConnectedClientsDesc ||
                "Select one of the available clients below to generate a configuration or enter an API Key."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectedConnections.map((conn) => (
              <AIConnectionCard
                key={conn.id}
                connection={conn}
                isPrimary={Boolean(conn.isPrimary)}
                onSetPrimary={handleSetPrimary}
                onTest={handleTestConnection}
                onOpenDetails={(c) => {
                  setSelectedConnection(c);
                  setIsDrawerOpen(true);
                }}
                onApplyConfig={handleTriggerPreview}
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
              {t.aiConnections?.availableClientsSection || "Available Native Clients (Native MCP)"}
            </h2>
            <p className="text-[11px] text-theme-muted">
              {t.aiConnections?.categoryDescNativeMcp}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {nativeMcpConnections.map((conn) => (
            <AIConnectionCard
              key={conn.id}
              connection={conn}
              isPrimary={Boolean(conn.isPrimary)}
              onSetPrimary={handleSetPrimary}
              onTest={handleTestConnection}
              onOpenDetails={(c) => {
                setSelectedConnection(c);
                setIsDrawerOpen(true);
              }}
              onApplyConfig={handleTriggerPreview}
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
              {t.aiConnections?.apiModelsSection || "API Models & Adapters (Tool/API Adapters)"}
            </h2>
            <p className="text-[11px] text-theme-muted">
              {t.aiConnections?.categoryDescToolAdapter}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {toolAdapterConnections.map((conn) => (
            <AIConnectionCard
              key={conn.id}
              connection={conn}
              isPrimary={Boolean(conn.isPrimary)}
              onSetPrimary={handleSetPrimary}
              onTest={handleTestConnection}
              onOpenDetails={(c) => {
                setSelectedConnection(c);
                setIsDrawerOpen(true);
              }}
              isTesting={testingId === conn.id}
            />
          ))}
        </div>
      </div>

      {/* SECTION 4: Custom Connections & Models */}
      {customConnections.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm font-bold text-theme-primary uppercase tracking-wider">
              {t.aiConnections?.customSection || "Custom Connections & Models"} ({customConnections.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customConnections.map((conn) => (
              <AIConnectionCard
                key={conn.id}
                connection={conn}
                isPrimary={Boolean(conn.isPrimary)}
                onSetPrimary={handleSetPrimary}
                onTest={handleTestConnection}
                onOpenDetails={(c) => {
                  setSelectedConnection(c);
                  setIsDrawerOpen(true);
                }}
                isTesting={testingId === conn.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Detail Slide-out Drawer */}
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

      {/* Config Preview & Diff Modal */}
      <ConfigPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewData(null);
          setPreviewTargetConn(null);
        }}
        preview={previewData}
        onConfirmApply={handleConfirmApplyConfig}
        isApplying={applyingId !== null}
        clientName={previewTargetConn?.name || "Client"}
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
