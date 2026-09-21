import { describe, it, expect } from "vitest";
import { zhCN } from "../apps/desktop/src/i18n/locales/zh-CN.js";
import { enUS } from "../apps/desktop/src/i18n/locales/en-US.js";

describe("AI Connection Center i18n Parity Suite", () => {
  function getDeepKeys(obj: Record<string, any>, prefix = ""): string[] {
    let keys: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        keys = keys.concat(getDeepKeys(v, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    return keys.sort();
  }

  it("ensures aiConnections section exists in both zh-CN and en-US", () => {
    expect(zhCN.aiConnections).toBeDefined();
    expect(enUS.aiConnections).toBeDefined();
    expect(typeof zhCN.aiConnections).toBe("object");
    expect(typeof enUS.aiConnections).toBe("object");
  });

  it("verifies 100% key parity between zh-CN and en-US aiConnections", () => {
    const zhKeys = getDeepKeys(zhCN.aiConnections);
    const enKeys = getDeepKeys(enUS.aiConnections);

    expect(zhKeys).toEqual(enKeys);
    expect(zhKeys.length).toBeGreaterThan(40);
  });

  it("verifies no empty string translations exist in aiConnections", () => {
    function checkNonEmpty(obj: Record<string, any>, path = "") {
      for (const [k, v] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${k}` : k;
        if (typeof v === "string") {
          expect(v.trim().length, `Empty translation at ${currentPath}`).toBeGreaterThan(0);
        } else if (v && typeof v === "object") {
          checkNonEmpty(v, currentPath);
        }
      }
    }

    checkNonEmpty(zhCN.aiConnections, "zhCN.aiConnections");
    checkNonEmpty(enUS.aiConnections, "enUS.aiConnections");
  });

  it("contains all essential Connection Center labels in both languages", () => {
    const requiredKeys = [
      "title",
      "subtitle",
      "primaryAi",
      "availableClientsSection",
      "apiModelsSection",
      "statusNotConfigured",
      "statusConfigured",
      "statusConnected",
      "statusError",
      "addCustomConnection",
      "applySuccess",
      "setAsPrimary",
      "isPrimary",
      "drawerTitle",
      "diffPreviewTitle",
    ];

    for (const key of requiredKeys) {
      expect((zhCN.aiConnections as any)[key]).toBeDefined();
      expect((enUS.aiConnections as any)[key]).toBeDefined();
    }
  });
});
