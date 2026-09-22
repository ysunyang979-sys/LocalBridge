import { describe, it, expect } from "vitest";
import React from "../apps/desktop/node_modules/react/index.js";
import ReactDOMServer from "../apps/desktop/node_modules/react-dom/server.js";
import { ChatGPTConnection } from "../apps/desktop/src/components/connections/ChatGPTConnection.js";
import { ThemeProvider } from "../apps/desktop/src/theme/ThemeContext.js";
import { I18nProvider } from "../apps/desktop/src/i18n/useTranslation.js";
import type { TunnelNetworkMode } from "../apps/desktop/src/types.js";

describe("chatgpt-connection-proxy-mode-transition.test - Proxy Mode Transitions", () => {
  it("transitions between direct, system, and custom proxy modes without hook order drift", () => {
    const modes: { mode: TunnelNetworkMode; proxyUrl?: string }[] = [
      { mode: "direct" },
      { mode: "system" },
      { mode: "custom", proxyUrl: "http://127.0.0.1:10808" },
      { mode: "direct" },
      { mode: "custom", proxyUrl: "socks5://127.0.0.1:1080" },
      { mode: "system" },
    ];

    for (const m of modes) {
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
                  network_mode: m.mode,
                  custom_proxy_url: m.proxyUrl,
                  has_api_key: true,
                  has_mcp_token: true,
                } as any,
                onRefreshAll: () => {},
              })
            )
          )
        );
        expect(html).toBeDefined();
        if (m.mode === "custom") {
          expect(html).toContain("自定义代理");
        }
      }).not.toThrow();
    }
  });
});
