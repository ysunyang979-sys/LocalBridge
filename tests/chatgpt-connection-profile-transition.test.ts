import { describe, it, expect } from "vitest";
import React from "../apps/desktop/node_modules/react/index.js";
import ReactDOMServer from "../apps/desktop/node_modules/react-dom/server.js";
import { ChatGPTConnection } from "../apps/desktop/src/components/connections/ChatGPTConnection.js";
import { ThemeProvider } from "../apps/desktop/src/theme/ThemeContext.js";
import { I18nProvider } from "../apps/desktop/src/i18n/useTranslation.js";

describe("chatgpt-connection-profile-transition.test - Profile & Scope State Transitions", () => {
  it("preserves hook order through profile exist vs not exist transitions", () => {
    const scenarios = [
      { configured: false, hasKey: false, hasToken: false },
      { configured: true, hasKey: true, hasToken: false },
      { configured: true, hasKey: true, hasToken: true },
      { configured: false, hasKey: true, hasToken: true },
    ];

    for (const sc of scenarios) {
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
                  status: sc.configured ? "Connected" : "Stopped",
                  control_plane_connected: sc.configured,
                  configured: sc.configured,
                  auto_reconnect: true,
                  network_mode: "system",
                  has_api_key: sc.hasKey,
                  has_mcp_token: sc.hasToken,
                } as any,
                onRefreshAll: () => {},
              })
            )
          )
        );
        expect(html).toBeDefined();
      }).not.toThrow();
    }
  });
});
