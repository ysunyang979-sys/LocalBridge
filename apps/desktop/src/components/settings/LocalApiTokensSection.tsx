import React, { useState, useEffect, useCallback } from "react";
import {
  KeyRound,
  Shield,
  Check,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Plus,
  Trash2,
  Code,
  Globe,
  Lock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { bridge, type TunnelStatusDto } from "../../api/bridge.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import type { Token } from "../../types.js";

export interface LocalApiTokensSectionProps {
  tunnelStatus: TunnelStatusDto | null;
  onRefreshAll: () => void;
}

export const LocalApiTokensSection: React.FC<LocalApiTokensSectionProps> = ({
  tunnelStatus: _tunnelStatus,
  onRefreshAll,
}) => {
  const { language } = useTranslation();
  const isZh = language === "zh-CN";

  // Tokens state
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [activeMcpToken, setActiveMcpToken] = useState<string>("");
  const [showActiveToken, setShowActiveToken] = useState(false);
  const [copiedActiveToken, setCopiedActiveToken] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  // Manual token update state
  const [manualToken, setManualToken] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create token form state
  const [tokenName, setTokenName] = useState(isZh ? "本地开发助手" : "Local Assistant");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["read", "write", "execute"]);
  const [expiryDays, setExpiryDays] = useState<number>(0); // 0 = never
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedCreatedSecret, setCopiedCreatedSecret] = useState(false);

  // Snippet tabs
  const [snippetTab, setSnippetTab] = useState<"ide" | "curl" | "python">("ide");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const localMcpEndpoint = "http://127.0.0.1:18080/mcp";

  const loadData = useCallback(async () => {
    setLoadingTokens(true);
    try {
      const [tokRes, activeRes] = await Promise.allSettled([
        bridge.listTokens(),
        bridge.tunnel.getMcpToken(),
      ]);

      if (tokRes.status === "fulfilled" && tokRes.value?.tokens) {
        setTokens(tokRes.value.tokens.filter((t) => t.type === "mcp"));
      }
      if (activeRes.status === "fulfilled" && activeRes.value?.token) {
        setActiveMcpToken(activeRes.value.token);
      }
    } catch {
      // Quiet fallback
    } finally {
      setLoadingTokens(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showNotification = (type: "success" | "error", text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleCopyEndpoint = async () => {
    await navigator.clipboard.writeText(localMcpEndpoint);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const handleCopyActiveToken = async () => {
    if (!activeMcpToken) return;
    await navigator.clipboard.writeText(activeMcpToken);
    setCopiedActiveToken(true);
    setTimeout(() => setCopiedActiveToken(false), 2000);
  };

  const handleSaveManualToken = async () => {
    const trimmed = manualToken.trim();
    if (!trimmed) {
      showNotification("error", isZh ? "令牌不能为空" : "Token cannot be empty");
      return;
    }
    setSavingManual(true);
    try {
      await bridge.tunnel.saveMcpToken(trimmed);
      setActiveMcpToken(trimmed);
      setManualToken("");
      showNotification(
        "success",
        isZh ? "令牌已持久化保存至 Windows DPAPI" : "Token successfully encrypted and saved to DPAPI"
      );
      onRefreshAll();
      await loadData();
    } catch (err: any) {
      showNotification("error", err?.message || String(err));
    } finally {
      setSavingManual(false);
    }
  };

  const toggleScope = (scope: string) => {
    if (selectedScopes.includes(scope)) {
      if (selectedScopes.length > 1) {
        setSelectedScopes(selectedScopes.filter((s) => s !== scope));
      }
    } else {
      setSelectedScopes([...selectedScopes, scope]);
    }
  };

  const handleCreateToken = async () => {
    const name = tokenName.trim() || (isZh ? "本地 API 令牌" : "Local API Token");
    setCreating(true);
    try {
      const expiresAt = expiryDays > 0 ? Date.now() + expiryDays * 86400 * 1000 : null;
      const res = await bridge.createToken({
        name,
        type: "mcp",
        scopes: selectedScopes,
        expiresAt,
      });

      if (res?.token) {
        setCreatedSecret(res.token);
        if (setAsDefault) {
          await bridge.tunnel.saveMcpToken(res.token);
          setActiveMcpToken(res.token);
          onRefreshAll();
        }
        showNotification(
          "success",
          isZh
            ? `本地 API 令牌 [${name}] 生成成功！${setAsDefault ? "已同步持久化到 Windows DPAPI。" : ""}`
            : `Token [${name}] created! ${setAsDefault ? "Persisted to DPAPI." : ""}`
        );
        await loadData();
      }
    } catch (err: any) {
      showNotification("error", err?.message || String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeToken = async (tokenId: string, name: string) => {
    const confirmMsg = isZh
      ? `确定要吊销令牌 "${name}" 吗？吊销后使用该令牌的客户端将无法连接。`
      : `Are you sure you want to revoke "${name}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await bridge.revokeToken(tokenId);
      showNotification("success", isZh ? `令牌 "${name}" 已成功吊销` : `Token "${name}" revoked`);
      await loadData();
    } catch (err: any) {
      showNotification("error", err?.message || String(err));
    }
  };

  const getIdeSnippet = (tokenStr: string) => {
    const tok = tokenStr || "YOUR_LOCAL_TOKEN_HERE";
    return JSON.stringify(
      {
        mcpServers: {
          localbridge: {
            url: "http://127.0.0.1:18080/mcp",
            headers: {
              Authorization: `Bearer ${tok}`,
            },
          },
        },
      },
      null,
      2
    );
  };

  const getCurlSnippet = (tokenStr: string) => {
    const tok = tokenStr || "YOUR_LOCAL_TOKEN_HERE";
    return `curl -X POST http://127.0.0.1:18080/mcp \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${tok}" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'`;
  };

  const getPythonSnippet = (tokenStr: string) => {
    const tok = tokenStr || "YOUR_LOCAL_TOKEN_HERE";
    return `import urllib.request
import json

url = "http://127.0.0.1:18080/mcp"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${tok}"
}
payload = {"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 1}

req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
with urllib.request.urlopen(req) as response:
    print(response.read().decode("utf-8"))`;
  };

  const activeSnippetContent =
    snippetTab === "ide"
      ? getIdeSnippet(activeMcpToken || createdSecret || "")
      : snippetTab === "curl"
      ? getCurlSnippet(activeMcpToken || createdSecret || "")
      : getPythonSnippet(activeMcpToken || createdSecret || "");

  const handleCopySnippet = async () => {
    await navigator.clipboard.writeText(activeSnippetContent);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* Header */}
      <div className="flex flex-col gap-1 pb-4 border-b border-theme-subtle">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-theme-primary">
            {isZh ? "本地 API 与 MCP 令牌管理" : "Local API & MCP Token Management"}
          </h2>
        </div>
        <p className="text-xs text-theme-muted leading-relaxed">
          {isZh
            ? "生成并管理用于本地 MCP / HTTP 调用的安全访问令牌，支持按需划分「读取、写入、命令执行」细粒度权限，凭据通过 Windows DPAPI 加密持久化。"
            : "Generate and manage secure access tokens for local MCP and HTTP invocation with fine-grained read, write, and execute permissions."}
        </p>
      </div>

      {/* Global Status Message Toast */}
      {statusMsg && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 transition ${
            statusMsg.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Section 1: Local Endpoint & Persistent DPAPI Token Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Endpoint Info */}
        <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle space-y-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-theme-subtle">
            <div className="flex items-center gap-2 text-xs font-semibold text-theme-primary">
              <Globe className="w-4 h-4 text-sky-500" />
              <span>{isZh ? "本地 MCP 服务端点" : "Local MCP Endpoint"}</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {isZh ? "运行中 (端口 18080)" : "Online (Port 18080)"}
            </span>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] text-theme-muted">{isZh ? "MCP 接入 URL" : "MCP Service URL"}</span>
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-theme-card-muted border border-theme-subtle font-mono text-xs text-theme-primary">
              <span className="truncate">{localMcpEndpoint}</span>
              <button
                type="button"
                onClick={handleCopyEndpoint}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                {copiedEndpoint ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500">{isZh ? "已复制" : "Copied"}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isZh ? "复制" : "Copy"}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="text-[11px] text-theme-muted leading-relaxed">
            {isZh
              ? "本地客户端（如 Cursor、Windsurf、各类 MCP 客户端或脚本）直接通过该地址即可与 Nexus 进行 JSON-RPC 交互。"
              : "Local tools and clients connect directly to this endpoint for JSON-RPC MCP operations."}
          </p>
        </div>

        {/* DPAPI Persisted Token Box */}
        <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle space-y-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-theme-subtle">
            <div className="flex items-center gap-2 text-xs font-semibold text-theme-primary">
              <Lock className="w-4 h-4 text-emerald-500" />
              <span>{isZh ? "当前默认 MCP 鉴权令牌" : "Active Default MCP Token"}</span>
            </div>
            <span className="text-[10px] font-mono text-theme-muted">
              {isZh ? "DPAPI 加密持久化" : "DPAPI Protected"}
            </span>
          </div>

          {activeMcpToken ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-theme-card-muted border border-theme-subtle font-mono text-xs text-theme-primary">
                <span className="truncate">
                  {showActiveToken ? activeMcpToken : `${activeMcpToken.slice(0, 7)}••••••••••••••••••••`}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowActiveToken(!showActiveToken)}
                    className="text-theme-muted hover:text-theme-primary cursor-pointer p-0.5"
                    title={showActiveToken ? (isZh ? "隐藏" : "Hide") : (isZh ? "显示明文" : "Show")}
                  >
                    {showActiveToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyActiveToken}
                    className="inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                  >
                    {copiedActiveToken ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-500">{isZh ? "已复制" : "Copied"}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isZh ? "复制" : "Copy"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {isZh ? "✓ 令牌已在当前会话生效并安全加密存储。" : "✓ Token active and securely encrypted."}
              </p>
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400">
              {isZh
                ? "尚未保存默认 MCP 访问令牌，请在下方生成或直接手动粘贴保存。"
                : "No default token stored. Generate a new token below or paste one."}
            </div>
          )}

          {/* Manual Token Quick Update */}
          <div className="pt-2 border-t border-theme-subtle/50 space-y-2">
            <span className="text-[11px] text-theme-muted font-medium">
              {isZh ? "手动绑定已有令牌到 DPAPI：" : "Or manually save token to DPAPI:"}
            </span>
            <div className="flex gap-2">
              <input
                type="password"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="lb_..."
                className="flex-1 bg-theme-input border border-theme-input rounded-lg px-2.5 py-1 text-xs font-mono text-theme-primary focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleSaveManualToken}
                disabled={savingManual || !manualToken.trim()}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer"
              >
                {savingManual ? (isZh ? "保存中..." : "Saving...") : (isZh ? "保存" : "Save")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Newly Created Token Banner (One-time Display) */}
      {createdSecret && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>{isZh ? "🎉 新令牌已生成完毕！" : "Token Successfully Generated!"}</span>
            </div>
            <button
              type="button"
              onClick={() => setCreatedSecret(null)}
              className="text-[11px] text-theme-muted hover:text-theme-primary cursor-pointer"
            >
              {isZh ? "关闭提示" : "Dismiss"}
            </button>
          </div>
          <p className="text-[11px] text-theme-muted">
            {isZh
              ? "请妥善保管该完整明文密钥（以 lb_ 开头），它仅在生成时完整展示一次："
              : "Copy this plaintext secret now. It will not be shown again in full:"}
          </p>
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-theme-card border border-emerald-500/30 font-mono text-xs text-theme-primary">
            <span className="break-all font-semibold text-emerald-600 dark:text-emerald-400">
              {createdSecret}
            </span>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(createdSecret);
                setCopiedCreatedSecret(true);
                setTimeout(() => setCopiedCreatedSecret(false), 2000);
              }}
              className="shrink-0 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1 cursor-pointer transition"
            >
              {copiedCreatedSecret ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>{isZh ? "已复制" : "Copied"}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>{isZh ? "一键复制" : "Copy"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Section 2: Token Generator with Scopes */}
      <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
              {isZh ? "生成新本地 API 令牌" : "Generate New Local API Token"}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="text-theme-muted text-[11px]">{isZh ? "快捷预设：" : "Presets:"}</span>
            {[
              { id: "readonly", label: isZh ? "只读" : "Read-Only", list: ["read"] },
              { id: "writeonly", label: isZh ? "只写" : "Write-Only", list: ["write"] },
              { id: "readwrite", label: isZh ? "读写" : "Read & Write", list: ["read", "write"] },
              { id: "execute", label: isZh ? "执行" : "Execute", list: ["execute"] },
              { id: "full", label: isZh ? "读写执行 (推荐)" : "Full Control", list: ["read", "write", "execute"] },
            ].map((p) => {
              const isSelected =
                p.list.length === selectedScopes.length &&
                p.list.every((s) => selectedScopes.includes(s));
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedScopes([...p.list])}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition cursor-pointer ${
                    isSelected
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border-theme-subtle"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-theme-secondary">
              {isZh ? "令牌名称 / 用途标识" : "Token Name / Client"}
            </label>
            <input
              type="text"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder={isZh ? "例如：Cursor 本地助手、测试脚本" : "e.g., Cursor MCP, Script"}
              className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-theme-secondary">
              {isZh ? "有效期设置" : "Expiration"}
            </label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-indigo-500"
            >
              <option value={0}>{isZh ? "永不过期 (推荐本地工具使用)" : "Never Expire (Recommended for local)"}</option>
              <option value={30}>{isZh ? "30 天" : "30 Days"}</option>
              <option value={90}>{isZh ? "90 天" : "90 Days"}</option>
              <option value={365}>{isZh ? "1 年 (365 天)" : "1 Year (365 Days)"}</option>
            </select>
          </div>
        </div>

        {/* Scopes Selection Checkboxes */}
        <div className="space-y-2 pt-2">
          <label className="block text-xs font-medium text-theme-secondary">
            {isZh ? "选择授权能力权限 (Scopes)" : "Granted Permissions (Scopes)"}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                id: "read",
                label: isZh ? "只读 (read)" : "Read (read)",
                desc: isZh ? "允许读取授权工作区文件、目录树及 Git 状态" : "Read workspace files, tree & git status",
                badgeColor: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
              },
              {
                id: "write",
                label: isZh ? "写入 (write)" : "Write (write)",
                desc: isZh ? "允许新建、修改和保存工作区内的代码与配置文件" : "Create and modify workspace files",
                badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
              },
              {
                id: "execute",
                label: isZh ? "执行 (execute)" : "Execute (execute)",
                desc: isZh ? "允许在安全沙箱中运行受控终端命令与构建测试" : "Run sandboxed terminal & test commands",
                badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
              },
            ].map((sc) => {
              const active = selectedScopes.includes(sc.id);
              return (
                <div
                  key={sc.id}
                  onClick={() => toggleScope(sc.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition select-none flex flex-col justify-between ${
                    active
                      ? "bg-indigo-500/5 border-indigo-500/40 shadow-xs"
                      : "bg-theme-card-muted border-theme-subtle opacity-65 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-semibold text-theme-primary">{sc.label}</span>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => {}}
                      className="rounded border-theme-input text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="text-[11px] text-theme-muted mt-1 leading-snug">{sc.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Set as DPAPI Default Checkbox */}
        <label className="flex items-center gap-2 cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={setAsDefault}
            onChange={(e) => setSetAsDefault(e.target.checked)}
            className="rounded border-theme-input text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-xs text-theme-secondary font-medium">
            {isZh
              ? "同时设为当前默认 MCP 鉴权令牌并保存到 Windows DPAPI (保持会话与重启持久化)"
              : "Save as default MCP token and encrypt with Windows DPAPI (persists across restarts)"}
          </span>
        </label>

        {/* Generate Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleCreateToken}
            disabled={creating}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition shadow-sm cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{creating ? (isZh ? "生成中..." : "Generating...") : (isZh ? "立即生成本地 API 令牌" : "Generate Local API Token")}</span>
          </button>
        </div>
      </div>

      {/* Section 3: Client Integration Code Snippets */}
      <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-3 shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-theme-subtle">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-purple-500" />
            <h3 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
              {isZh ? "常用客户端接入代码" : "Client Configuration Snippets"}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSnippetTab("ide")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                snippetTab === "ide"
                  ? "bg-theme-card-hover text-theme-primary border border-theme-subtle"
                  : "text-theme-muted hover:text-theme-primary"
              }`}
            >
              {isZh ? "AI 编辑器 (JSON)" : "AI Editor (JSON)"}
            </button>
            <button
              type="button"
              onClick={() => setSnippetTab("curl")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                snippetTab === "curl"
                  ? "bg-theme-card-hover text-theme-primary border border-theme-subtle"
                  : "text-theme-muted hover:text-theme-primary"
              }`}
            >
              cURL (Bash)
            </button>
            <button
              type="button"
              onClick={() => setSnippetTab("python")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                snippetTab === "python"
                  ? "bg-theme-card-hover text-theme-primary border border-theme-subtle"
                  : "text-theme-muted hover:text-theme-primary"
              }`}
            >
              Python
            </button>
          </div>
        </div>

        <div className="relative">
          <pre className="p-3.5 rounded-lg bg-theme-input font-mono text-[11px] text-theme-primary overflow-x-auto leading-relaxed border border-theme-subtle">
            {activeSnippetContent}
          </pre>
          <button
            type="button"
            onClick={handleCopySnippet}
            className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded bg-theme-card border border-theme-subtle text-[11px] font-mono text-theme-secondary hover:text-theme-primary flex items-center gap-1 shadow-xs cursor-pointer transition"
          >
            {copiedSnippet ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-500">{isZh ? "已复制" : "Copied"}</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>{isZh ? "复制代码" : "Copy"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Section 4: Issued Local Tokens Table */}
      <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-3 shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-theme-subtle">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-sky-500" />
            <h3 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
              {isZh ? "已颁发的本地令牌列表" : "Issued Local Tokens"}
            </h3>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loadingTokens}
            className="inline-flex items-center gap-1 text-[11px] text-theme-muted hover:text-theme-primary cursor-pointer transition"
          >
            <RefreshCw className={`w-3 h-3 ${loadingTokens ? "animate-spin" : ""}`} />
            <span>{isZh ? "刷新" : "Refresh"}</span>
          </button>
        </div>

        {tokens.length === 0 ? (
          <div className="py-6 text-center text-xs text-theme-muted">
            {loadingTokens
              ? (isZh ? "正在加载令牌列表..." : "Loading tokens...")
              : (isZh ? "暂无已颁发的本地 MCP 令牌" : "No issued MCP tokens found")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-theme-subtle text-theme-muted text-[11px]">
                  <th className="pb-2 font-medium">{isZh ? "名称 / 标识" : "Name"}</th>
                  <th className="pb-2 font-medium">{isZh ? "授权范围" : "Scopes"}</th>
                  <th className="pb-2 font-medium">{isZh ? "创建时间" : "Created At"}</th>
                  <th className="pb-2 font-medium">{isZh ? "过期时间" : "Expires"}</th>
                  <th className="pb-2 font-medium text-right">{isZh ? "操作" : "Action"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-subtle/50">
                {tokens.map((tok) => {
                  const isRevoked = !!tok.revokedAt;
                  const isExpired = !!tok.expiresAt && tok.expiresAt < Date.now();
                  return (
                    <tr key={tok.id} className="hover:bg-theme-card-hover/40 transition">
                      <td className="py-2.5 text-theme-primary font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{tok.name}</span>
                          {isRevoked ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-500/10 text-red-500 border border-red-500/20">
                              {isZh ? "已吊销" : "Revoked"}
                            </span>
                          ) : isExpired ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              {isZh ? "已过期" : "Expired"}
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              {isZh ? "正常" : "Active"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {tok.scopes?.map((s) => (
                            <span
                              key={s}
                              className="text-[10px] px-1.5 py-0.2 rounded bg-theme-input border border-theme-subtle text-theme-secondary font-mono"
                            >
                              {s}
                            </span>
                          )) || <span className="text-theme-muted">-</span>}
                        </div>
                      </td>
                      <td className="py-2.5 text-theme-muted text-[11px]">
                        {new Date(tok.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 text-theme-muted text-[11px]">
                        {tok.expiresAt ? new Date(tok.expiresAt).toLocaleDateString() : (isZh ? "永久有效" : "Never")}
                      </td>
                      <td className="py-2.5 text-right">
                        {!isRevoked ? (
                          <button
                            type="button"
                            onClick={() => handleRevokeToken(tok.id, tok.name)}
                            className="text-red-500 hover:text-red-400 text-xs inline-flex items-center gap-1 cursor-pointer transition"
                            title={isZh ? "吊销此令牌" : "Revoke token"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{isZh ? "吊销" : "Revoke"}</span>
                          </button>
                        ) : (
                          <span className="text-theme-muted text-[11px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
