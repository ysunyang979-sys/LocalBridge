import { describe, it, expect } from "vitest";
import { resolveConnectionViewModel } from "../apps/desktop/src/components/connections/view-model.js";
import type { AIConnectionDto } from "@localbridge/protocol";

describe("AI Connection Action States across Client Lifecycles", () => {
  it("resolves ChatGPT status to connected when tunnel is online", () => {
    const chatGptDto: AIConnectionDto = {
      id: "conn_chatgpt",
      clientType: "chatgpt",
      name: "ChatGPT",
      category: "native-mcp",
      status: "configured",
      transport: "tunnel",
      endpoint: "https://test.nexus.localbridge.dev/mcp",
      scopes: ["read", "write", "execute"],
      toolCount: 59,
      isPrimary: true,
      createdAt: Date.now(),
    };

    const vmOnline = resolveConnectionViewModel(chatGptDto, {
      status: "Connected",
    })!;
    expect(vmOnline.status).toBe("connected");
    expect(vmOnline.isPrimary).toBe(true);

    const vmOffline = resolveConnectionViewModel(
      { ...chatGptDto, status: "connected" },
      { status: "Disconnected" }
    )!;
    expect(vmOffline.status).toBe("offline");
  });

  it("handles Kimi Web lifecycle: not_configured, configured, and connected", () => {
    const kimiUnconfigured: AIConnectionDto = {
      id: "conn_kimi_web",
      clientType: "kimi-web",
      name: "Kimi Web",
      category: "native-mcp",
      status: "not_configured",
      transport: "tunnel",
      endpoint: "",
      scopes: ["read", "write"],
      toolCount: 0,
      isPrimary: false,
      createdAt: Date.now(),
    };

    const tunnelConnected = {
      status: "Connected" as const,
    };

    const vm1 = resolveConnectionViewModel(kimiUnconfigured, tunnelConnected)!;
    expect(vm1.status).toBe("not_configured");

    // With dedicated token configured
    const kimiConfigured: AIConnectionDto = {
      ...kimiUnconfigured,
      tokenId: "tok_kimi_123",
      tokenMasked: "lb_kimi_••••1234",
    };
    const vm2 = resolveConnectionViewModel(kimiConfigured, tunnelConnected)!;
    expect(vm2.status).toBe("configured");

    // Fully connected
    const kimiConnected: AIConnectionDto = {
      ...kimiConfigured,
      status: "connected",
    };
    const vm3 = resolveConnectionViewModel(kimiConnected, tunnelConnected)!;
    expect(vm3.status).toBe("connected");
  });

  it("differentiates DeepSeek and Custom OpenAI unconfigured vs configured states", () => {
    const deepseekDto: AIConnectionDto = {
      id: "conn_deepseek",
      clientType: "deepseek",
      name: "DeepSeek",
      category: "tool-adapter",
      status: "not_configured",
      transport: "http",
      endpoint: "https://api.deepseek.com",
      scopes: ["read", "write"],
      toolCount: 0,
      isPrimary: false,
      createdAt: Date.now(),
      metadata: { hasApiKey: false },
    };

    const vmDs = resolveConnectionViewModel(deepseekDto)!;
    expect(vmDs.status).toBe("not_configured");

    const customOpenAiDto: AIConnectionDto = {
      id: "conn_custom_openai",
      clientType: "custom-openai",
      name: "OpenAI-compatible",
      category: "tool-adapter",
      status: "configured",
      transport: "http",
      endpoint: "http://localhost:11434/v1",
      scopes: ["read", "write"],
      toolCount: 20,
      isPrimary: false,
      createdAt: Date.now(),
      metadata: { hasApiKey: true, apiKeyMasked: "sk-••••9988" },
    };

    const vmOpenAi = resolveConnectionViewModel(customOpenAiDto)!;
    expect(vmOpenAi.status).toBe("configured");
  });
});
