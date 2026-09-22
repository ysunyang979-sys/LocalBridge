import { describe, it, expect, vi } from "vitest";
import React from "../apps/desktop/node_modules/react/index.js";
import ReactDOMServer from "../apps/desktop/node_modules/react-dom/server.js";
import { ChatGPTConnection } from "../apps/desktop/src/components/connections/ChatGPTConnection.js";
import { ThemeProvider } from "../apps/desktop/src/theme/ThemeContext.js";
import { I18nProvider } from "../apps/desktop/src/i18n/useTranslation.js";
import { bridge } from "../apps/desktop/src/api/bridge.js";

describe("chatgpt-connection-loading-transition.test - Loading to Loaded Transition", () => {
  it("renders correctly during initial loading and after connection resolved", async () => {
    // Mock bridge.listAiConnections
    const spy = vi.spyOn(bridge, "listAiConnections").mockResolvedValue({
      connections: [
        {
          id: "conn_chatgpt",
          clientType: "chatgpt",
          name: "ChatGPT",
          isPrimary: true,
          status: "configured",
          scopes: ["read", "write", "execute"],
          latencyMs: 15,
          tokenMasked: "lb_••••••••",
        } as any,
      ],
    });

    // 1. Initial render (loading state)
    const initialHtml = ReactDOMServer.renderToString(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(
          I18nProvider,
          null,
          React.createElement(ChatGPTConnection, {
            tunnelStatus: null,
            onRefreshAll: () => {},
          })
        )
      )
    );
    expect(initialHtml).toBeDefined();
    expect(initialHtml).toContain("ChatGPT");

    // 2. Render with connected tunnel
    const loadedHtml = ReactDOMServer.renderToString(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(
          I18nProvider,
          null,
          React.createElement(ChatGPTConnection, {
            tunnelStatus: {
              status: "Connected",
              control_plane_connected: true,
              configured: true,
              auto_reconnect: true,
              network_mode: "system",
              has_api_key: true,
              has_mcp_token: true,
            } as any,
            onRefreshAll: () => {},
          })
        )
      )
    );
    expect(loadedHtml).toContain("64");
    expect(loadedHtml).toContain("Secure MCP Tunnel");

    spy.mockRestore();
  });
});
