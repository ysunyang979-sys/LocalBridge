import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Light Theme & Semantic Token Quality Suite", () => {
  const cssPath = path.resolve(process.cwd(), "apps/desktop/src/index.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  it("verifies index.css exists and contains [data-theme='light'] block", () => {
    expect(cssContent).toContain('[data-theme="light"]');
    expect(cssContent).toContain('[data-theme="dark"]');
  });

  it("confirms complete token parity between light and dark themes", () => {
    const requiredTokens = [
      "--bg",
      "--surface",
      "--surface-muted",
      "--surface-elevated",
      "--border",
      "--border-strong",
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--input-bg",
      "--input-text",
      "--input-placeholder",
      "--input-border",
      "--accent",
      "--accent-hover",
    ];

    // Extract dark block
    const darkMatch = cssContent.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/);
    expect(darkMatch, "Dark theme token block missing").not.toBeNull();
    const darkBlock = darkMatch![1];

    // Extract light block
    const lightMatch = cssContent.match(/\[data-theme="light"\]\s*\{([^}]+)\}/);
    expect(lightMatch, "Light theme token block missing").not.toBeNull();
    const lightBlock = lightMatch![1];

    for (const token of requiredTokens) {
      expect(darkBlock).toContain(token);
      expect(lightBlock).toContain(token);
    }
  });

  it("validates high contrast readability for light mode text and surfaces", () => {
    // Light mode background must be light-tinted (#f6f8fc or similar)
    expect(cssContent).toMatch(/\[data-theme="light"\][\s\S]*--bg:\s*#f[0-9a-f]{5}/i);

    // Light mode text-primary must be dark (#0f172a or #111827 dark slate)
    expect(cssContent).toMatch(/\[data-theme="light"\][\s\S]*--text-primary:\s*#(?:0[0-9a-f]{5}|111827)/i);

    // Light mode input background must be bright (#ffffff or #f8fafc)
    expect(cssContent).toMatch(/\[data-theme="light"\][\s\S]*--input-bg:\s*#(?:ffffff|f8fafc)/i);
  });

  it("verifies 2px solid accent focus outline rules exist in index.css", () => {
    expect(cssContent).toContain("input:focus");
    expect(cssContent).toContain("--accent");
    expect(cssContent).toContain("box-shadow: 0 0 0 2px");
  });
});
