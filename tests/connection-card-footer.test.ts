import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("AI Connection Card Footer Layout & Action Hierarchy", () => {
  const cardPath = path.resolve(
    process.cwd(),
    "apps/desktop/src/components/connections/AIConnectionCard.tsx"
  );
  const cardContent = fs.readFileSync(cardPath, "utf-8");

  it("verifies card footer has explicit top border separator", () => {
    // Must contain border-t with explicit separator colors in light and dark mode
    expect(cardContent).toMatch(/border-t\s+border-slate-200\s+dark:border-white\/10/);
    expect(cardContent).toMatch(/pt-3\.5\s+mt-3/);
  });

  it("verifies left side of footer hosts primary status badge and contextual hints", () => {
    expect(cardContent).toContain("isPrimary");
    expect(cardContent).toContain("onSetPrimary");
    expect(cardContent).toContain("authRequiredReason");
  });

  it("enforces maximum of two main action buttons on the right side per card state", () => {
    // 1. ChatGPT branch: exactly 1 action (viewDetails)
    const chatGptSection = cardContent.match(/isChatGPT\s*&&[\s\S]*?(\{[^}]*isKimiWeb)/);
    expect(chatGptSection).not.toBeNull();
    const chatGptButtons = (chatGptSection![0].match(/<button/g) || []).length;
    expect(chatGptButtons).toBeLessThanOrEqual(2);

    // 2. Kimi Web unconfigured branch: max 2 actions (installationGuide + connectKimi)
    const kimiUnconfiguredMatch = cardContent.match(/!isConfigured\s*\?\s*\([\s\S]*?\)\s*:\s*vm\.status === "auth_required"/);
    expect(kimiUnconfiguredMatch).not.toBeNull();
    const kimiUnconfButtons = (kimiUnconfiguredMatch![0].match(/<button/g) || []).length;
    expect(kimiUnconfButtons).toBeLessThanOrEqual(2);

    // 3. Claude / Gemini not connected branch: max 2 actions (viewDetails + quickConfigure)
    const mcpUnconnectedMatch = cardContent.match(/!isConnected\s*\?\s*\([\s\S]*?\)\s*:\s*\(/);
    expect(mcpUnconnectedMatch).not.toBeNull();
    const mcpButtons = (mcpUnconnectedMatch![0].match(/<button/g) || []).length;
    expect(mcpButtons).toBeLessThanOrEqual(2);

    // 4. API adapters (DeepSeek / OpenAI): max 2 actions per branch
    const apiAdapters = cardContent.match(/!isNativeMcp\s*&&[\s\S]*?<\/div>\s*<\/div>/);
    expect(apiAdapters).not.toBeNull();
    const apiButtons = (apiAdapters![0].match(/<button/g) || []).length;
    expect(apiButtons).toBeLessThanOrEqual(3); // across unconfigured (1) + configured (2) = 3 total in branch
  });
});
