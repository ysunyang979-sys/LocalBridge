import { describe, it, expect } from "vitest";
import {
  BUILTIN_CLIENT_CATALOG,
  mergeCatalogWithSavedConnections,
} from "../apps/desktop/src/components/connections/catalog.js";
import type { AIConnectionDto } from "../apps/desktop/src/types.js";

describe("Primary AI & ChatGPT Tunnel Mapping Suite", () => {
  it("automatically sets ChatGPT status to 'connected' when tunnel is connected", () => {
    const merged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], {
      status: "Connected",
      latencyMs: 18,
    });

    const chatgpt = merged.find((c) => c.clientType === "chatgpt");
    expect(chatgpt).toBeDefined();
    expect(chatgpt?.status).toBe("connected");
    expect(chatgpt?.latencyMs).toBe(18);
    expect(chatgpt?.toolCount).toBe(55);
  });

  it("sets ChatGPT status to 'not_configured' or 'offline' when tunnel is disconnected", () => {
    const merged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], {
      status: "Disconnected",
    });

    const chatgpt = merged.find((c) => c.clientType === "chatgpt");
    expect(chatgpt).toBeDefined();
    expect(chatgpt?.status).not.toBe("connected");
  });

  it("resolves primary AI correctly based on isPrimary flag in saved connections", () => {
    const savedConnections: AIConnectionDto[] = [
      {
        id: "conn_chatgpt",
        clientType: "chatgpt",
        name: "ChatGPT",
        category: "native-mcp",
        status: "connected",
        transport: "tunnel",
        scopes: ["read", "write"],
        isPrimary: false,
      },
      {
        id: "conn_claude",
        clientType: "claude",
        name: "Claude Code",
        category: "native-mcp",
        status: "connected",
        transport: "http",
        scopes: ["read", "write"],
        isPrimary: true,
      },
    ];

    const merged = mergeCatalogWithSavedConnections(
      BUILTIN_CLIENT_CATALOG,
      savedConnections,
      { status: "Connected" }
    );

    const primary = merged.find((c) => c.isPrimary);
    expect(primary).toBeDefined();
    expect(primary?.id).toBe("conn_claude");
    expect(primary?.name).toBe("Claude Code");
  });

  it("defaults primary AI to ChatGPT when no saved connections exist", () => {
    const merged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], null);
    const primary = merged.find((c) => c.isPrimary) || merged[0];
    expect(primary).toBeDefined();
    expect(primary.id).toBe("conn_chatgpt");
  });
});
