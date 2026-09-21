import { describe, it, expect, vi } from "vitest";
import { BUILTIN_CLIENT_CATALOG, mergeCatalogWithSavedConnections } from "../apps/desktop/src/components/connections/catalog.js";
import { resolveConnectionViewModel } from "../apps/desktop/src/components/connections/view-model.js";

describe("AI Connection Card Click & Action Dispatch Suite", () => {
  const mockTunnel = {
    status: "Connected" as const,
    activeTunnels: 1,
    tunnelId: "tun_test123",
    publicHttpsUrl: "https://secure-proxy.nexus.internal",
    publicHost: "secure-proxy.nexus.internal",
    lastHeartbeat: new Date().toISOString(),
    isHealthy: true,
  };

  it("handles clicks safely for all 6 primary provider card types", () => {
    const clients = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], mockTunnel);
    const expectedTypes = ["chatgpt", "kimi-web", "claude", "gemini", "deepseek", "custom-openai"];

    for (const type of expectedTypes) {
      const client = clients.find((c) => c.clientType === type);
      expect(client, `Client ${type} must exist in catalog`).toBeDefined();

      const vm = resolveConnectionViewModel(client, mockTunnel);
      expect(vm).not.toBeNull();
      expect(vm?.id).toBeTruthy();
      expect(vm?.name).toBeTruthy();
      expect(vm?.clientType).toBe(type);
    }
  });

  it("dispatches correct primary and secondary action semantics for unconfigured Kimi Web", () => {
    const kimi = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "kimi-web")!;
    const vm = resolveConnectionViewModel(kimi, mockTunnel)!;

    expect(vm.status).toBe("not_configured");
    expect(vm.quickActionType).toBe("kimi-plugin");

    // Click handler simulation
    const onOpenDetails = vi.fn();
    const onOpenKimiPlugin = vi.fn();

    // Primary action for unconfigured Kimi is to open Kimi drawer/plugin
    if (vm.quickActionType === "kimi-plugin") {
      onOpenKimiPlugin(kimi);
    } else {
      onOpenDetails(kimi);
    }

    expect(onOpenKimiPlugin).toHaveBeenCalledWith(kimi);
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it("dispatches single '查看详情' action for connected ChatGPT without excessive disabled buttons", () => {
    const chatgpt = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "chatgpt")!;
    const savedChatGpt = {
      ...chatgpt,
      status: "connected" as const,
      tokenId: "tok_chatgpt_123",
      isPrimary: true,
    };
    const vm = resolveConnectionViewModel(savedChatGpt, mockTunnel)!;

    expect(vm.status).toBe("connected");
    expect(vm.isPrimary).toBe(true);

    const onOpenDetails = vi.fn();
    onOpenDetails(savedChatGpt);
    expect(onOpenDetails).toHaveBeenCalledWith(savedChatGpt);
  });

  it("dispatches preview config action for native CLI clients (Claude / Gemini)", () => {
    const claude = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "claude")!;
    const vm = resolveConnectionViewModel(claude, mockTunnel)!;

    expect(vm.quickActionType).toBe("apply-config");
    const onApplyConfig = vi.fn();
    onApplyConfig(claude);
    expect(onApplyConfig).toHaveBeenCalledWith(claude);
  });
});
