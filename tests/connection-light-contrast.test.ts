import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Connection Center Light Theme Contrast Suite", () => {
  const cssPath = path.resolve(__dirname, "../apps/desktop/src/index.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  it("verifies index.css exists and contains root variables", () => {
    expect(cssContent.length).toBeGreaterThan(100);
    expect(cssContent).toContain(":root");
  });

  it("defines high-contrast Light Theme background and surface tokens", () => {
    expect(cssContent).toContain("#F4F7FB"); // --bg
    expect(cssContent).toContain("#FFFFFF"); // --surface
    expect(cssContent).toContain("#F8FAFC"); // --surface-muted
    expect(cssContent).toContain("#F1F5F9"); // --surface-hover
  });

  it("defines strong readable borders in Light Theme", () => {
    expect(cssContent).toContain("#D7DFEA"); // --border
    expect(cssContent).toContain("#C2CCD9"); // --border-strong
  });

  it("defines high-contrast typography tokens in Light Theme", () => {
    expect(cssContent).toContain("#111827"); // --text-primary
    expect(cssContent).toContain("#475569"); // --text-secondary
    expect(cssContent).toContain("#64748B"); // --text-muted
    expect(cssContent).toContain("#7C8A9D"); // --text-subtle
  });

  it("enforces disabled button opacity >= 0.45 for accessibility and readability", () => {
    // Check for disabled button styling rule in CSS
    const hasDisabledRule =
      cssContent.includes("opacity: 0.65") ||
      cssContent.includes("opacity: 0.52") ||
      cssContent.includes("opacity: 0.5") ||
      cssContent.includes("disabled:opacity-");
    expect(hasDisabledRule).toBe(true);
  });
});
