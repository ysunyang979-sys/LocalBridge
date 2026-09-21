import { describe, it, expect } from "vitest";
import { zhCN } from "../apps/desktop/src/i18n/locales/zh-CN.js";
import { enUS } from "../apps/desktop/src/i18n/locales/en-US.js";

describe("AI Connection Button & Tooltip i18n Completeness", () => {
  const requiredKeys = [
    "viewDetails",
    "connectKimi",
    "completeAuth",
    "installationGuide",
    "quickConfigure",
    "applyConfig",
    "testConnection",
    "configure",
    "addConfig",
    "authRequiredReason",
    "configRequiredReason",
    "tunnelManagedReason",
  ] as const;

  it("verifies all required action button and tooltip keys exist in zh-CN locale", () => {
    const zhAi = zhCN.aiConnections as Record<string, any>;
    expect(zhAi).toBeDefined();

    for (const key of requiredKeys) {
      expect(zhAi[key], `Missing key in zh-CN: ${key}`).toBeDefined();
      expect(typeof zhAi[key]).toBe("string");
      expect(zhAi[key].length).toBeGreaterThan(0);
    }

    // Explicit checks on Chinese wording
    expect(zhAi.viewDetails).toBe("查看详情");
    expect(zhAi.connectKimi).toBe("连接 Kimi");
    expect(zhAi.completeAuth).toBe("完成授权");
    expect(zhAi.quickConfigure).toBe("一键配置");
    expect(zhAi.tunnelManagedReason).toBe("当前连接已由 Secure MCP Tunnel 管理");
  });

  it("verifies all required action button and tooltip keys exist in en-US locale", () => {
    const enAi = enUS.aiConnections as Record<string, any>;
    expect(enAi).toBeDefined();

    for (const key of requiredKeys) {
      expect(enAi[key], `Missing key in en-US: ${key}`).toBeDefined();
      expect(typeof enAi[key]).toBe("string");
      expect(enAi[key].length).toBeGreaterThan(0);
    }

    // Explicit checks on English wording
    expect(enAi.viewDetails).toBe("View Details");
    expect(enAi.connectKimi).toBe("Connect Kimi");
    expect(enAi.completeAuth).toBe("Complete Authorization");
    expect(enAi.quickConfigure).toBe("Quick Configure");
    expect(enAi.tunnelManagedReason).toBe("Connection managed by Secure MCP Tunnel");
  });

  it("ensures no untranslated placeholder text in either language", () => {
    const zhAi = zhCN.aiConnections as Record<string, any>;
    const enAi = enUS.aiConnections as Record<string, any>;

    for (const key of requiredKeys) {
      expect(zhAi[key]).not.toContain("TODO");
      expect(zhAi[key]).not.toContain("FIXME");
      expect(enAi[key]).not.toContain("TODO");
      expect(enAi[key]).not.toContain("FIXME");
    }
  });
});
