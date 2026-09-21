import { describe, it, expect } from "vitest";
import { BUILTIN_CLIENT_CATALOG, mergeCatalogWithSavedConnections } from "../apps/desktop/src/components/connections/catalog.js";
import { resolveConnectionViewModel } from "../apps/desktop/src/components/connections/view-model.js";
import type { AIConnectionDto } from "../apps/desktop/src/types.js";

describe("Drawer Saved Connection Model & Lifecycle Suite", () => {
  const mockSavedConnection: AIConnectionDto = {
    id: "conn_chatgpt_real",
    name: "ChatGPT (Custom)",
    category: "native-mcp",
    clientType: "chatgpt",
    transport: "tunnel",
    status: "connected",
    endpoint: "https://secure.nexus.example.com/mcp",
    scopes: ["read", "write"],
    isPrimary: true,
    tokenId: "lb_tok_live9876543210abcdef",
    lastSeen: new Date().toISOString(),
    latencyMs: 14,
    metadata: {
      managedBy: "user",
    },
  };

  const mockTunnel = {
    status: "Connected" as const,
    activeTunnels: 1,
    tunnelId: "tun_test123",
    publicHttpsUrl: "https://secure.nexus.example.com",
    publicHost: "secure.nexus.example.com",
    lastHeartbeat: new Date().toISOString(),
    isHealthy: true,
  };

  it("safely resolves saved connection with source = 'saved'", () => {
    const vm = resolveConnectionViewModel(mockSavedConnection, mockTunnel);

    expect(vm).not.toBeNull();
    expect(vm!.source).toBe("saved");
    expect(vm!.savedConnectionId).toBe("conn_chatgpt_real");
    expect(vm!.id).toBe("conn_chatgpt_real");
    expect(vm!.name).toBe("ChatGPT (Custom)");
    expect(vm!.status).toBe("connected");
    expect(vm!.isPrimary).toBe(true);
    expect(vm!.tokenId).toBe("lb_tok_live9876543210abcdef");
    expect(vm!.maskedToken).toContain("lb_tok_");
    expect(vm!.maskedToken).toContain("••••");
    expect(vm!.latencyMs).toBe(14);
    expect(vm!.lastSeen).toBeDefined();
  });

  it("overlays saved connection onto builtin catalog cleanly in mergeCatalogWithSavedConnections", () => {
    const merged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [mockSavedConnection], mockTunnel);
    const chatGptItem = merged.find((c) => c.clientType === "chatgpt");

    expect(chatGptItem).toBeDefined();
    expect(chatGptItem!.id).toBe("conn_chatgpt_real");
    expect(chatGptItem!.status).toBe("connected");
    expect(chatGptItem!.isPrimary).toBe(true);
    expect(chatGptItem!.tokenId).toBe("lb_tok_live9876543210abcdef");
  });

  it("masks sensitive tokens securely without exposing the entire secret string", () => {
    const vm = resolveConnectionViewModel(mockSavedConnection, mockTunnel)!;
    expect(vm.maskedToken).not.toBe(mockSavedConnection.tokenId);
    expect(vm.maskedToken!.length).toBeLessThan(mockSavedConnection.tokenId!.length + 5);
  });
});
