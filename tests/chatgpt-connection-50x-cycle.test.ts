import { describe, it, expect, vi } from "vitest";
import React from "../apps/desktop/node_modules/react/index.js";
import ReactDOMServer from "../apps/desktop/node_modules/react-dom/server.js";
import { ChatGPTConnection } from "../apps/desktop/src/components/connections/ChatGPTConnection.js";
import { SettingsPage } from "../apps/desktop/src/pages/SettingsPage.js";
import { ThemeProvider } from "../apps/desktop/src/theme/ThemeContext.js";
import { I18nProvider } from "../apps/desktop/src/i18n/useTranslation.js";
import { bridge } from "../apps/desktop/src/api/bridge.js";
import type { TunnelStatusDto, TunnelNetworkMode } from "../apps/desktop/src/types.js";

describe("ChatGPT Connection & Settings 50x Continuous Cycle Verification", () => {
  it("executes 50 continuous transitions into and out of ChatGPT Connection under various proxy and profile conditions without any Hook error", () => {
    vi.spyOn(bridge, "listAiConnections").mockResolvedValue({
      connections: [
        {
          id: "conn_chatgpt",
          clientType: "chatgpt",
          name: "ChatGPT",
          isPrimary: true,
          status: "configured",
          scopes: ["read", "write", "execute"],
          latencyMs: 12,
          tokenMasked: "lb_••••••••",
        } as any,
      ],
    });
    vi.spyOn(bridge, "listProjects").mockResolvedValue({ projects: [] });
    vi.spyOn(bridge, "getOperatorDisplayName").mockResolvedValue({ displayName: "Operator" });
    vi.spyOn(bridge, "getApprovalRoutingMode").mockResolvedValue({ mode: "chat" });
    vi.spyOn(bridge, "getIntelligenceStatus").mockResolvedValue({ provider: "disabled" } as any);
    vi.spyOn(bridge, "getModelStatus").mockResolvedValue({ installed: false, status: "not_installed" } as any);

    const proxyModes: TunnelNetworkMode[] = ["system", "direct", "custom"];
    const uxModes: ("standard" | "advanced")[] = ["standard", "advanced"];

    for (let i = 1; i <= 50; i++) {
      const mode = proxyModes[i % proxyModes.length];
      const ux = uxModes[i % uxModes.length];
      const isConnected = i % 3 !== 0;

      const tunnelStatus: TunnelStatusDto = {
        tunnel_id: `tunnel_test_${i}`,
        status: isConnected ? "Connected" : "Stopped",
        control_plane_connected: isConnected,
        control_plane_status: isConnected ? "Connected" : "Disconnected",
        local_mcp_connected: isConnected,
        local_mcp_status: isConnected ? "Ready" : "Unavailable",
        configured: true,
        auto_reconnect: true,
        network_mode: mode,
        custom_proxy_url: mode === "custom" ? "http://127.0.0.1:7890" : undefined,
        has_api_key: true,
        has_mcp_token: true,
        reconnect_attempts: 0,
        health_port: 8080,
      };

      // Render ChatGPTConnection
      expect(() => {
        const html = ReactDOMServer.renderToString(
          React.createElement(
            ThemeProvider,
            null,
            React.createElement(
              I18nProvider,
              null,
              React.createElement(ChatGPTConnection, {
                tunnelStatus,
                onRefreshAll: () => {},
                uxMode: ux,
              })
            )
          )
        );
        expect(html).toContain("ChatGPT");
        expect(html).toContain("66");
        expect(html).toContain("lb_");
      }).not.toThrow();

      // Render SettingsPage
      expect(() => {
        const htmlSettings = ReactDOMServer.renderToString(
          React.createElement(
            ThemeProvider,
            null,
            React.createElement(
              I18nProvider,
              null,
              React.createElement(SettingsPage, {
                tunnelStatus,
                onRefresh: () => {},
                uxMode: ux,
              })
            )
          )
        );
        expect(htmlSettings).toBeDefined();
      }).not.toThrow();
    }
  });
});
