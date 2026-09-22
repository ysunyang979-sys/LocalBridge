import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

describe("settings-no-ai-center-route.test - AI Connection Center Residue Removed", () => {
  const settingsPath = path.join(process.cwd(), "apps/desktop/src/pages/SettingsPage.tsx");
  const settingsContent = fs.readFileSync(settingsPath, "utf-8");

  it("SettingsRoute does not contain connection-detail or secure-mcp as separate route pages", () => {
    expect(settingsContent).not.toContain('page: "connection-detail"');
    expect(settingsContent).not.toContain('page: "secure-mcp"');
  });

  it("SettingsTab does not contain tunnel as an independent tab", () => {
    expect(settingsContent).not.toMatch(/SettingsTab\s*=\s*[\s\S]*?\|\s*"tunnel"/);
  });

  it("does not contain '返回 AI 连接中心' or 'Back to AI Connections'", () => {
    expect(settingsContent).not.toContain("返回 AI 连接中心");
    expect(settingsContent).not.toContain("Back to AI Connections");
  });

  it("does not contain obsolete multi-client authorization cards (Kimi Web, Claude Desktop, Gemini CLI)", () => {
    expect(settingsContent).not.toContain("conn_kimi_web");
    expect(settingsContent).not.toContain("Claude Desktop");
    expect(settingsContent).not.toContain("Gemini CLI");
    expect(settingsContent).not.toContain("主要 AI");
  });

  it("SettingsPage renders ChatGPTConnection inside ConnectionCenterErrorBoundary under tab connections", () => {
    expect(settingsContent).toContain("<ConnectionCenterErrorBoundary");
    expect(settingsContent).toContain("<ChatGPTConnection");
    expect(settingsContent).toContain('activeTab === "connections"');
  });
});
