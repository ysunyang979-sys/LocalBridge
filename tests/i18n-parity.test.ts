import { describe, it, expect } from "vitest";
import { enUS } from "../apps/desktop/src/i18n/locales/en-US.js";
import { zhCN } from "../apps/desktop/src/i18n/locales/zh-CN.js";
import { detectInitialLanguage, getTranslatedError } from "../apps/desktop/src/i18n/index.js";

function getKeysRecursively(obj: Record<string, any>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys = keys.concat(getKeysRecursively(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe("Desktop i18n Internationalization Suite", () => {
  it("guarantees 100% key parity between en-US and zh-CN", () => {
    const enKeys = getKeysRecursively(enUS as any);
    const zhKeys = getKeysRecursively(zhCN as any);

    const missingInZh = enKeys.filter((k) => !zhKeys.includes(k));
    const missingInEn = zhKeys.filter((k) => !enKeys.includes(k));

    expect(missingInZh, `Keys present in en-US but missing in zh-CN: ${missingInZh.join(", ")}`).toEqual([]);
    expect(missingInEn, `Keys present in zh-CN but missing in en-US: ${missingInEn.join(", ")}`).toEqual([]);
    expect(enKeys.length).toBeGreaterThan(50);
  });

  it("verifies no empty translation values in either locale", () => {
    function assertNoEmptyValues(obj: Record<string, any>, locale: string, path = "") {
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = path ? `${path}.${k}` : k;
        if (typeof v === "string") {
          expect(v.trim().length, `Empty string found at ${locale}:${fullKey}`).toBeGreaterThan(0);
        } else if (v && typeof v === "object") {
          assertNoEmptyValues(v, locale, fullKey);
        }
      }
    }

    assertNoEmptyValues(enUS, "en-US");
    assertNoEmptyValues(zhCN, "zh-CN");
  });

  it("translates backend error codes accurately into human messages", () => {
    // Chinese error messages
    expect(getTranslatedError("PROJECT_ALREADY_AUTHORIZED", "zh-CN")).toContain("此项目已经授权");
    expect(getTranslatedError("MCP_SCOPE_DENIED", "zh-CN")).toContain("权限范围");
    expect(getTranslatedError("RUNNER_OFFLINE", "zh-CN")).toContain("没有在线的 Runner");

    // English error messages
    expect(getTranslatedError("PROJECT_ALREADY_AUTHORIZED", "en-US")).toContain("already authorized");
    expect(getTranslatedError("MCP_SCOPE_DENIED", "en-US")).toContain("does not have permission");

    // Unknown error fallback
    expect(getTranslatedError("UNKNOWN_ERROR_CODE", "zh-CN")).toContain("未知");
    expect(getTranslatedError("UNKNOWN_ERROR_CODE", "en-US", "Custom failure")).toBe("Custom failure (UNKNOWN_ERROR_CODE)");
  });

  it("correctly identifies Chinese locale variants during language detection", () => {
    const originalNavigator = globalThis.navigator;

    try {
      // Mock Chinese Windows language
      Object.defineProperty(globalThis, "navigator", {
        value: { language: "zh-CN", languages: ["zh-CN", "zh", "en"] },
        configurable: true,
      });
      // Clear localStorage
      if (typeof localStorage !== "undefined") localStorage.clear();

      expect(detectInitialLanguage()).toBe("zh-CN");

      // Mock English environment
      Object.defineProperty(globalThis, "navigator", {
        value: { language: "en-US", languages: ["en-US", "en"] },
        configurable: true,
      });
      expect(detectInitialLanguage()).toBe("en-US");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    }
  });
});
