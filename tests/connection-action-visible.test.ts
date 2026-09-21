import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("AI Connection Card Action Buttons Visibility", () => {
  const cardFilePath = path.resolve(
    process.cwd(),
    "apps/desktop/src/components/connections/AIConnectionCard.tsx"
  );
  const cardContent = fs.readFileSync(cardFilePath, "utf-8");

  it("ensures no action button has invisible or near-invisible opacity classes", () => {
    // Prohibit opacity-10, opacity-15, opacity-20, opacity-25 on action buttons
    const invisibleOpacityPatterns = [
      /opacity-10\b/,
      /opacity-15\b/,
      /opacity-20\b/,
      /opacity-25\b/,
      /opacity:\s*0\.1\b/,
      /opacity:\s*0\.15\b/,
      /opacity:\s*0\.2\b/,
    ];

    for (const pattern of invisibleOpacityPatterns) {
      expect(cardContent).not.toMatch(pattern);
    }
  });

  it("verifies all card action buttons use btn-primary or btn-secondary design system classes", () => {
    expect(cardContent).toContain("btn-primary");
    expect(cardContent).toContain("btn-secondary");

    // Ensure footer action section explicitly utilizes btn-* styling
    const footerSectionMatch = cardContent.match(
      /Right: Main Action Buttons[\s\S]*?<\/div>\s*<\/div>/
    );
    expect(footerSectionMatch).not.toBeNull();
    const footerContent = footerSectionMatch![0];

    // Split by `<button` occurrences to check each button's classes
    const buttonSnippets = footerContent.split("<button").slice(1);
    expect(buttonSnippets.length).toBeGreaterThanOrEqual(6);

    for (const snippet of buttonSnippets) {
      const classMatch = snippet.match(/className=(?:["']([^"']+)["']|\{`([^`]+)`\})/);
      expect(classMatch, `Button missing className attribute: ${snippet.slice(0, 50)}`).not.toBeNull();
      const classes = classMatch![1] || classMatch![2];
      const hasBtnClass =
        classes.includes("btn-primary") ||
        classes.includes("btn-secondary") ||
        classes.includes("btn-tertiary") ||
        classes.includes("btn-disabled");
      expect(hasBtnClass, `Button missing standardized btn-* class: ${classes}`).toBe(true);
    }
  });

  it("ensures ChatGPT action button is clearly visible as btn-secondary with settings icon", () => {
    expect(cardContent).toMatch(/isChatGPT\s*&&[\s\S]*?btn-secondary[\s\S]*?viewDetails/);
  });

  it("ensures Kimi Web has primary and secondary actions clearly styled", () => {
    expect(cardContent).toMatch(/isKimiWeb\s*&&[\s\S]*?connectKimi[\s\S]*?btn-primary/);
    expect(cardContent).toMatch(/isKimiWeb\s*&&[\s\S]*?installationGuide[\s\S]*?btn-secondary/);
  });

  it("ensures Claude & Gemini have quickConfigure and viewDetails styled with high contrast", () => {
    expect(cardContent).toMatch(/quickConfigure[\s\S]*?btn-primary/);
    expect(cardContent).toMatch(/viewDetails[\s\S]*?btn-secondary/);
  });

  it("ensures DeepSeek & Custom OpenAI have distinct primary configure/test actions", () => {
    expect(cardContent).toMatch(/testConnection[\s\S]*?btn-primary/);
    expect(cardContent).toMatch(/configure[\s\S]*?btn-primary/);
  });
});
