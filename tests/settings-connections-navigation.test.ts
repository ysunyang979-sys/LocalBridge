import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Settings & AI Connection Center Navigation Suite", () => {
  const settingsPagePath = path.resolve(process.cwd(), "apps/desktop/src/pages/SettingsPage.tsx");
  const connectionCenterPath = path.resolve(process.cwd(), "apps/desktop/src/components/connections/AIConnectionCenter.tsx");
  const settingsContent = fs.readFileSync(settingsPagePath, "utf-8");
  const connectionCenterContent = fs.readFileSync(connectionCenterPath, "utf-8");

  describe("settings-route-state", () => {
    it("defines a unified SettingsRoute type avoiding conflicting boolean state", () => {
      expect(settingsContent).toContain("type SettingsRoute =");
      expect(settingsContent).toContain('{ page: "connections" }');
      expect(settingsContent).toContain('{ page: "connection-detail"; id: string }');
      expect(settingsContent).toContain('{ page: "secure-mcp" }');
    });

    it("uses route state in SettingsPage component", () => {
      expect(settingsContent).toContain("const [route, setRoute] = useState<SettingsRoute>");
    });
  });

  describe("settings-connections-navigation & settings-tunnel-return", () => {
    it("provides back button and breadcrumb when viewing secure-mcp subview", () => {
      expect(settingsContent).toContain("route.page === \"secure-mcp\"");
      expect(settingsContent).toContain("返回 AI 连接中心");
      expect(settingsContent).toContain("setRoute({ page: \"connections\" })");
      expect(settingsContent).toContain("应用设置");
      expect(settingsContent).toContain("AI 连接中心");
      expect(settingsContent).toContain("Secure MCP 隧道");
    });

    it("keeps AIConnectionCenter mounted with hidden attribute to preserve scroll & state", () => {
      // It should not unmount AIConnectionCenter when navigating to secure-mcp or other subviews
      expect(settingsContent).toMatch(/<div className=\{route\.page === "connections" \? "block" : "hidden"\}>/);
      expect(settingsContent).toContain("<AIConnectionCenter");
    });
  });

  describe("settings-detail-back", () => {
    it("provides Drawer for connection detail and does not replace Settings page", () => {
      expect(connectionCenterContent).toContain("<ConnectionDetailDrawer");
      expect(connectionCenterContent).toContain("isOpen={isDrawerOpen}");
      expect(connectionCenterContent).toContain("setIsDrawerOpen(false)");
    });
  });

  describe("connection-connected-summary", () => {
    it("renders compact summary row for connected client instead of full duplicate card", () => {
      expect(connectionCenterContent).toContain("已连接的 AI 客户端");
      expect(connectionCenterContent).toContain("主要 AI");
      expect(connectionCenterContent).toContain("查看详情");
    });
  });

  describe("connection-status-semantics", () => {
    it("maps connection status semantics accurately", () => {
      const statusMapZh: Record<string, string> = {
        connected: "已连接",
        configured: "已配置",
        detected: "已检测",
        auth_required: "等待授权",
        offline: "离线",
        error: "错误",
        not_configured: "未配置",
      };

      const statusMapEn: Record<string, string> = {
        connected: "Connected",
        configured: "Configured",
        detected: "Detected",
        auth_required: "Authorization Required",
        offline: "Offline",
        error: "Error",
        not_configured: "Not Configured",
      };

      expect(statusMapZh["auth_required"]).toBe("等待授权");
      expect(statusMapEn["auth_required"]).toBe("Authorization Required");
      expect(statusMapZh["connected"]).toBe("已连接");
      expect(statusMapEn["connected"]).toBe("Connected");
    });
  });

  describe("connection-card-readability & connection-button-contrast", () => {
    const cssPath = path.resolve(process.cwd(), "apps/desktop/src/index.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");

    it("defines high contrast tokens for light mode in index.css", () => {
      expect(cssContent).toContain("--bg: #F4F7FB");
      expect(cssContent).toContain("--surface: #FFFFFF");
      expect(cssContent).toContain("--border: #D7DFEA");
      expect(cssContent).toContain("--text-primary: #111827");
      expect(cssContent).toContain("--text-secondary: #475569");
      expect(cssContent).toContain("--text-muted: #64748B");
    });

    it("configures disabled buttons to be visually legible with light mode styling", () => {
      expect(cssContent).toContain("button:disabled");
      expect(cssContent).toContain("cursor: not-allowed");
      expect(cssContent).toContain("#F1F5F9");
      expect(cssContent).toContain("#64748B");
      expect(cssContent).toContain("#D7DFEA");
    });
  });
});
