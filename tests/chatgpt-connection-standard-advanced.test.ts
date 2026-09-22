import { describe, it, expect } from "vitest";
import React from "../apps/desktop/node_modules/react/index.js";
import ReactDOMServer from "../apps/desktop/node_modules/react-dom/server.js";
import { ChatGPTConnection } from "../apps/desktop/src/components/connections/ChatGPTConnection.js";
import { ThemeProvider } from "../apps/desktop/src/theme/ThemeContext.js";
import { I18nProvider } from "../apps/desktop/src/i18n/useTranslation.js";

describe("chatgpt-connection-standard-advanced.test - Standard / Advanced Mode Toggling", () => {
  it("toggles uxMode between standard and advanced seamlessly across multiple renders", () => {
    const modes: ("standard" | "advanced")[] = [
      "standard",
      "advanced",
      "standard",
      "advanced",
      "standard",
    ];

    for (const uxMode of modes) {
      expect(() => {
        const html = ReactDOMServer.renderToString(
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
                uxMode,
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
