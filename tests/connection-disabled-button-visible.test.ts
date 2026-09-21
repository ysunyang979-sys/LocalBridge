import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Disabled Action Buttons Visibility & Reason Clarity", () => {
  const cssPath = path.resolve(process.cwd(), "apps/desktop/src/index.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  const cardPath = path.resolve(
    process.cwd(),
    "apps/desktop/src/components/connections/AIConnectionCard.tsx"
  );
  const cardContent = fs.readFileSync(cardPath, "utf-8");

  it("verifies index.css sets button:disabled opacity to at least 0.60 and not invisible", () => {
    // Check that button:disabled has opacity >= 0.6
    const disabledRuleMatch = cssContent.match(
      /button:disabled[\s\S]*?\{([^}]+)\}/
    );
    expect(disabledRuleMatch).not.toBeNull();
    const disabledRule = disabledRuleMatch![1];

    const opacityMatch = disabledRule.match(/opacity:\s*([0-9.]+)/);
    expect(opacityMatch).not.toBeNull();
    const opacityValue = parseFloat(opacityMatch![1]);
    expect(opacityValue).toBeGreaterThanOrEqual(0.6);

    // Verify background and text colors are explicitly legible
    expect(disabledRule).toContain("background-color");
    expect(disabledRule).toContain("color");
    expect(disabledRule).toContain("border");
    expect(disabledRule).toContain("cursor: not-allowed");
  });

  it("ensures dark theme disabled buttons maintain minimum opacity and legible borders", () => {
    const darkDisabledMatch = cssContent.match(
      /\[data-theme="dark"\]\s+button:disabled[\s\S]*?\{([^}]+)\}/
    );
    expect(darkDisabledMatch).not.toBeNull();
    const darkDisabledRule = darkDisabledMatch![1];

    const opacityMatch = darkDisabledRule.match(/opacity:\s*([0-9.]+)/);
    expect(opacityMatch).not.toBeNull();
    const opacityValue = parseFloat(opacityMatch![1]);
    expect(opacityValue).toBeGreaterThanOrEqual(0.6);
  });

  it("ensures disabled action buttons provide clear contextual explanations via title attributes", () => {
    // Actions that can be disabled (e.g. testing, applying config, or tunnel managed)
    // must supply a title attribute indicating the reason to the user
    expect(cardContent).toContain("title=");
    expect(cardContent).toContain("tunnelManagedReason");
    expect(cardContent).toContain("applyingConfig");
  });

  it("prohibits rendering meaningless standalone disabled buttons without purpose", () => {
    // Non-configured API providers must display an active configure button, NOT an unclickable disabled button
    expect(cardContent).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*配置[^<]*<\/button>/);
  });
});
