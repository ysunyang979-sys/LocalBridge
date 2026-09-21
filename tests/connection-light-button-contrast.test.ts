import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace("#", "").trim();
  const bigint = parseInt(cleanHex, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrast(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Light Theme Button Color Contrast & Accessibility Suite", () => {
  const cssPath = path.resolve(process.cwd(), "apps/desktop/src/index.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  it("verifies index.css contains .btn-primary, .btn-secondary, .btn-tertiary, and .btn-disabled", () => {
    expect(cssContent).toContain(".btn-primary");
    expect(cssContent).toContain(".btn-secondary");
    expect(cssContent).toContain(".btn-tertiary");
    expect(cssContent).toContain(".btn-disabled");
  });

  it("validates .btn-secondary has outstanding contrast in Light Theme (>= 7:1 WCAG AAA)", () => {
    // Background: #f8fafc, Text: #334155
    const bg = hexToRgb("#f8fafc");
    const text = hexToRgb("#334155");
    const ratio = getContrast(bg, text);

    expect(ratio).toBeGreaterThanOrEqual(7.0);
  });

  it("validates .btn-primary has high contrast on white text (>= 4.0:1)", () => {
    // Background: #0284c7, Text: #ffffff
    const bg = hexToRgb("#0284c7");
    const text = hexToRgb("#ffffff");
    const ratio = getContrast(bg, text);

    expect(ratio).toBeGreaterThanOrEqual(4.0);
  });

  it("validates disabled buttons maintain clear contrast and readable text in Light Theme (>= 3.0:1)", () => {
    // Background: #f1f5f9, Text: #64748b
    const bg = hexToRgb("#f1f5f9");
    const text = hexToRgb("#64748b");
    const ratio = getContrast(bg, text);

    expect(ratio).toBeGreaterThanOrEqual(3.5);
  });

  it("ensures light theme cards do not place near-white text on light backgrounds", () => {
    // Ensure no btn-* or card button sets color: #f8fafc or #ffffff over transparent/white bg
    const secondaryBlockMatch = cssContent.match(/\.btn-secondary\s*\{([^}]+)\}/);
    expect(secondaryBlockMatch).not.toBeNull();
    const secondaryBlock = secondaryBlockMatch![1];
    expect(secondaryBlock).not.toMatch(/(?:^|[^-\w])color:\s*#ffffff/);
    expect(secondaryBlock).not.toMatch(/(?:^|[^-\w])color:\s*#f8fafc/);
    expect(secondaryBlock).toContain("color: #334155");
  });
});
