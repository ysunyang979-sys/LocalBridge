import { describe, expect, it } from "vitest";
import { zhCN } from "../apps/desktop/src/i18n/locales/zh-CN.js";
import { enUS } from "../apps/desktop/src/i18n/locales/en-US.js";

describe("Skills i18n Dictionary Parity", () => {
  it("ensures nav.skills is defined in both languages", () => {
    expect(zhCN.nav.skills).toBe("技能");
    expect(enUS.nav.skills).toBe("Skills");
  });

  it("ensures 100% key parity between zh-CN and en-US for skills section", () => {
    const zhKeys = Object.keys(zhCN.skills).sort();
    const enKeys = Object.keys(enUS.skills).sort();

    expect(zhKeys).toEqual(enKeys);

    for (const key of zhKeys) {
      const zhVal = (zhCN.skills as any)[key];
      const enVal = (enUS.skills as any)[key];

      expect(typeof zhVal, `zh-CN.skills.${key} must be a string`).toBe("string");
      expect(typeof enVal, `en-US.skills.${key} must be a string`).toBe("string");
      expect(zhVal.length, `zh-CN.skills.${key} must not be empty`).toBeGreaterThan(0);
      expect(enVal.length, `en-US.skills.${key} must not be empty`).toBeGreaterThan(0);
    }
  });
});
