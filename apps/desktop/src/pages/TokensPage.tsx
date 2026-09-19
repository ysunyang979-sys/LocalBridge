import React, { useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import type { Token } from "../types.js";
import { bridge } from "../api/bridge.js";

interface TokensPageProps {
  tokens: Token[];
  onOpenCreateTokenModal: () => void;
  onRefresh: () => void;
}

export const TokensPage: React.FC<TokensPageProps> = ({
  tokens,
  onOpenCreateTokenModal,
  onRefresh,
}) => {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = async (id: string) => {
    const ok = window.confirm("Are you sure you want to revoke this token? Any connected clients will immediately lose access.");
    if (!ok) return;

    setRevokingId(id);
    setError(null);
    try {
      await bridge.revokeToken(id);
      onRefresh();
    } catch (err: any) {
      setError(err.message || "Failed to revoke token");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Authentication Tokens</h2>
          <p className="text-xs text-slate-400">
            Manage Bearer tokens for MCP AI clients (Claude Desktop, Cursor) and Runner daemons.
          </p>
        </div>
        <button
          onClick={onOpenCreateTokenModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Generate Token</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-300">
          {error}
        </div>
      )}

      {tokens.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <KeyRound className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="text-slate-300 font-semibold text-sm">No Tokens Found</div>
          <p className="text-slate-500 text-xs">
            Generate an MCP token to connect Claude Desktop or other AI clients.
          </p>
          <button
            onClick={onOpenCreateTokenModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs transition"
          >
            Generate First Token
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => {
            const isRevoked = token.revokedAt !== null && token.revokedAt !== undefined;
            const created = new Date(token.createdAt);
            const lastUsed = token.lastUsedAt ? new Date(token.lastUsedAt) : null;

            return (
              <div
                key={token.id}
                className={`p-4 bg-slate-900 border rounded-xl flex items-center justify-between gap-4 transition ${
                  isRevoked ? "border-slate-800/40 opacity-50" : "border-slate-800"
                }`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`badge ${
                        token.type === "mcp" ? "badge-blue" : "badge-purple"
                      }`}
                    >
                      {token.type.toUpperCase()}
                    </span>
                    <span className="font-semibold text-xs text-slate-100">
                      {token.name}
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      {token.id}
                    </span>
                    {isRevoked ? (
                      <span className="badge badge-red">REVOKED</span>
                    ) : (
                      <span className="badge badge-green">ACTIVE</span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                    <span>Created: {created.toLocaleDateString()}</span>
                    <span>
                      Last Used: {lastUsed ? lastUsed.toLocaleTimeString() : "Never"}
                    </span>
                    <span>Scopes: {(token.scopes || []).join(", ") || "all"}</span>
                  </div>
                </div>

                <div>
                  {!isRevoked && (
                    <button
                      onClick={() => handleRevoke(token.id)}
                      disabled={revokingId === token.id}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                      title="Revoke Token"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
