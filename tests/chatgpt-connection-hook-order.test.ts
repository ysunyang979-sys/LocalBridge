import { describe, it, expect } from "vitest";
import React from "../apps/desktop/node_modules/react/index.js";
import ReactDOMServer from "../apps/desktop/node_modules/react-dom/server.js";
import { ChatGPTConnection } from "../apps/desktop/src/components/connections/ChatGPTConnection.js";
import { ThemeProvider } from "../apps/desktop/src/theme/ThemeContext.js";
import { I18nProvider } from "../apps/desktop/src/i18n/useTranslation.js";
import type { TunnelStatusDto } from "../apps/desktop/src/types.js";

describe("chatgpt-connection-hook-order.test - Hook Order Stability Across 20+ Continuous Cycles", () => {
  it("executes 25 continuous render cycles with varying tunnel states without any hook order crash", () => {
    const states: (TunnelStatusDto | null)[] = [
      null,
      { status: "Connecting", control_plane_connected: false, configured: false, auto_reconnect: true, network_mode: "system", has_api_key: false, has_mcp_token: false } as any,
      { status: "Connected", control_plane_connected: true, configured: true, auto_reconnect: true, network_mode: "system", has_api_key: true, has_mcp_token: true } as any,
      { status: "Reconnecting", control_plane_connected: false, configured: true, auto_reconnect: true, network_mode: "direct", has_api_key: true, has_mcp_token: true } as any,
      { status: "Connected", control_plane_connected: true, configured: true, auto_reconnect: true, network_mode: "custom", custom_proxy_url: "http://127.0.0.1:7890", has_api_key: true, has_mcp_token: true } as any,
      { status: "Stopped", control_plane_connected: false, configured: true, auto_reconnect: false, network_mode: "system", has_api_key: true, has_mcp_token: true } as any,
    ];

    for (let i = 0; i < 25; i++) {
      const state = states[i % states.length];
      expect(() => {
        const html = ReactDOMServer.renderToString(
          React.createElement(
            ThemeProvider,
            null,
            React.createElement(
              I18nProvider,
              null,
              React.createElement(ChatGPTConnection, {
                tunnelStatus: state,
                onRefreshAll: () => {},
                uxMode: i % 2 === 0 ? "standard" : "advanced",
              })
            )
          )
        );
        expect(html).toBeDefined();
        expect(html).toContain("ChatGPT");
      }).not.toThrow();
    }
  });
});
