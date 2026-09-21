import React, { useState } from "react";
import { X, Plus, Server, Cpu } from "lucide-react";
import type { AIConnectionConfig, ProviderPreset } from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface AddCustomConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: ProviderPreset[];
  onSubmit: (config: AIConnectionConfig) => Promise<void>;
  isSubmitting: boolean;
}

export const AddCustomConnectionModal: React.FC<AddCustomConnectionModalProps> = ({
  isOpen,
  onClose,
  presets,
  onSubmit,
  isSubmitting,
}) => {
  const { t, language } = useTranslation();
  const isZh = language === "zh-CN";

  const [category, setCategory] = useState<"native-mcp" | "tool-adapter">("tool-adapter");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("custom");

  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [transport, setTransport] = useState<"http" | "streamable-http" | "sse" | "stdio">("http");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (presetId === "custom") {
      setName("");
      setEndpoint("");
      setModel("");
      return;
    }
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      setName(preset.name);
      setEndpoint(preset.defaultBaseUrl || "");
      setModel(preset.suggestedModels?.[0] || "");
      setCategory("tool-adapter");
      setTransport("http");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg(isZh ? "请输入连接名称" : "Please enter a connection name");
      return;
    }
    setErrorMsg(null);

    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newConfig: AIConnectionConfig = {
      id: connectionId,
      clientType: category === "native-mcp" ? "custom-mcp" : "custom-openai",
      name: name.trim(),
      category,
      transport: category === "native-mcp" ? transport : "http",
      endpoint: endpoint.trim() || undefined,
      baseUrl: category === "tool-adapter" ? (endpoint.trim() || undefined) : undefined,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
      apiFormat: category === "tool-adapter" ? "openai-compatible" : undefined,
      metadata: {
        presetId: selectedPresetId,
      },
    };

    try {
      await onSubmit(newConfig);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || (isZh ? "添加连接失败" : "Failed to create connection"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-theme-card border border-theme-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-theme-primary">
                {t.aiConnections?.addModalTitle || "添加新 AI 连接"}
              </h2>
              <p className="text-xs text-theme-muted">
                {isZh
                  ? "连接外部 Native MCP 客户端或 OpenAI 兼容工具调用模型"
                  : "Connect external Native MCP clients or OpenAI-compatible models"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-sans">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Category Tabs */}
          <div className="space-y-1.5">
            <label className="text-theme-muted text-[11px] block font-semibold">
              {t.aiConnections?.architecture || "连接架构"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCategory("native-mcp");
                  setTransport("http");
                }}
                className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                  category === "native-mcp"
                    ? "bg-teal-500/10 border-teal-500/40 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30"
                    : "bg-theme-card-muted border-theme-subtle text-theme-secondary hover:border-theme-hover"
                }`}
              >
                <Server className="w-4 h-4 mt-0.5 text-teal-500 shrink-0" />
                <div>
                  <div className="font-bold text-xs">
                    {isZh ? "Native MCP 客户端" : "Native MCP Client"}
                  </div>
                  <div className="text-[10px] text-theme-muted mt-0.5">
                    {isZh ? "通过本地 HTTP / stdio 协议直连" : "Connects via HTTP or stdio"}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCategory("tool-adapter");
                  setTransport("http");
                }}
                className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                  category === "tool-adapter"
                    ? "bg-purple-500/10 border-purple-500/40 text-purple-700 dark:text-purple-300 ring-1 ring-purple-500/30"
                    : "bg-theme-card-muted border-theme-subtle text-theme-secondary hover:border-theme-hover"
                }`}
              >
                <Cpu className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" />
                <div>
                  <div className="font-bold text-xs">
                    {isZh ? "API 模型适配器" : "API Model Adapter"}
                  </div>
                  <div className="text-[10px] text-theme-muted mt-0.5">
                    {isZh ? "OpenAI 兼容 Function Calling" : "OpenAI-compatible Function Calling"}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Preset Selector for Tool Adapters */}
          {category === "tool-adapter" && presets.length > 0 && (
            <div className="space-y-1">
              <label className="text-theme-muted text-[11px] block font-mono">
                {t.aiConnections?.presetLabel || "选择预设服务商"}
              </label>
              <select
                value={selectedPresetId}
                onChange={(e) => handlePresetSelect(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card-muted border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
              >
                <option value="custom">-- {t.aiConnections?.presetCustom || "自定义 / Other"} --</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.suggestedModels?.[0] || p.defaultBaseUrl})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Connection Name */}
          <div className="space-y-1">
            <label className="text-theme-muted text-[11px] block font-mono">
              {t.aiConnections?.clientName || "连接显示名称"} *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isZh ? "例如：SiliconFlow Qwen2.5 / 本地 Ollama" : "e.g. SiliconFlow Qwen2.5 / Local Ollama"}
              className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card-muted border border-theme-subtle text-theme-primary focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Endpoint URL */}
          <div className="space-y-1">
            <label className="text-theme-muted text-[11px] block font-mono">
              {t.aiConnections?.endpointUrl || "接口服务地址"}
            </label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={
                category === "native-mcp"
                  ? "http://127.0.0.1:18080/mcp"
                  : "https://api.siliconflow.cn/v1 或 http://localhost:11434/v1"
              }
              className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card-muted border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* API Key & Model (if tool adapter) */}
          {category === "tool-adapter" && (
            <>
              <div className="space-y-1">
                <label className="text-theme-muted text-[11px] block font-mono">
                  {t.aiConnections?.apiKey || "API 密钥 (API Key)"}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={isZh ? "sk-•••••••• (本地加密保存)" : "sk-•••••••• (Securely stored locally)"}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card-muted border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted text-[11px] block font-mono">
                  {t.aiConnections?.modelName || "默认模型名称"}
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={isZh ? "例如：Qwen/Qwen2.5-Coder-32B-Instruct" : "e.g. Qwen/Qwen2.5-Coder-32B-Instruct"}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-theme-card-muted border border-theme-subtle text-theme-primary font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-theme-subtle flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover border border-theme-subtle transition"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? t.common.loading : t.common.confirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
