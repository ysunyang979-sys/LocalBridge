import { describe, it, expect } from "vitest";
import { BUILTIN_CLIENT_CATALOG, mergeCatalogWithSavedConnections } from "../apps/desktop/src/components/connections/catalog.js";
import { resolveConnectionViewModel } from "../apps/desktop/src/components/connections/view-model.js";
import { zhCN } from "../apps/desktop/src/i18n/locales/zh-CN.js";
import { enUS } from "../apps/desktop/src/i18n/locales/en-US.js";

describe("Connection Status Semantics & Strict Provider Categorization Suite", () => {
  const mockTunnel = {
    status: "Connected" as const,
    activeTunnels: 1,
    tunnelId: "tun_test123",
    publicHttpsUrl: "https://secure.nexus.example.com",
    publicHost: "secure.nexus.example.com",
    lastHeartbeat: new Date().toISOString(),
    isHealthy: true,
  };

  it("verifies i18n contains all distinct status keys including statusDetected and statusAuthRequired", () => {
    const requiredStatusKeys = [
      "statusConnected",
      "statusConfigured",
      "statusDetected",
      "statusNotConfigured",
      "statusOffline",
      "statusError",
      "statusAuthRequired",
    ];

    for (const key of requiredStatusKeys) {
      expect((zhCN.aiConnections as any)[key], `zh-CN missing ${key}`).toBeDefined();
      expect((enUS.aiConnections as any)[key], `en-US missing ${key}`).toBeDefined();
    }

    expect(zhCN.aiConnections.statusDetected).toBe("已检测");
    expect(enUS.aiConnections.statusDetected).toBe("Detected");
    expect(zhCN.aiConnections.statusConfigured).toBe("已配置");
    expect(enUS.aiConnections.statusConfigured).toBe("Configured");
    expect(zhCN.aiConnections.statusConnected).toBe("已连接");
    expect(enUS.aiConnections.statusConnected).toBe("Connected");
  });

  it("ensures unconfigured Kimi Web shows 'not_configured' and NOT 'offline' when tunnel is active", () => {
    const kimi = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "kimi-web")!;
    const vm = resolveConnectionViewModel(kimi, mockTunnel)!;

    expect(vm.status).toBe("not_configured");
    expect(vm.status).not.toBe("offline");
  });

  it("ensures DeepSeek catalog preset defaults to 'not_configured' and NOT 'configured'", () => {
    const deepseek = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "deepseek")!;
    const vm = resolveConnectionViewModel(deepseek, mockTunnel)!;

    expect(vm.status).toBe("not_configured");
    expect(vm.status).not.toBe("configured");
  });

  it("ensures Custom OpenAI catalog preset defaults to 'not_configured' and NOT 'configured'", () => {
    const customOpenAi = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "custom-openai")!;
    const vm = resolveConnectionViewModel(customOpenAi, mockTunnel)!;

    expect(vm.status).toBe("not_configured");
    expect(vm.status).not.toBe("configured");
  });

  it("differentiates 'detected' status for detected config files from 'configured'", () => {
    const detectedClaude = {
      ...BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "claude")!,
      status: "detected" as const,
    };
    const vm = resolveConnectionViewModel(detectedClaude as any, mockTunnel)!;

    expect(vm.status).toBe("detected");
    expect(vm.status).not.toBe("configured");
    expect(vm.status).not.toBe("connected");
  });
});
