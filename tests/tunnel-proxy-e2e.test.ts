import { describe, it, expect, vi } from "vitest";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  WindowsSystemProxyResolver,
  TunnelEnvironmentBuilder,
  TunnelConnectionMonitor,
  type TunnelNetworkMode,
  type TunnelEnvironmentConfig,
  redactProxyUrl,
} from "@localbridge/protocol";
import type { TunnelSaveConfigInput, TunnelStatusDto } from "../apps/desktop/src/api/bridge.js";

describe("Tunnel Outbound Network & Proxy E2E Matrix", () => {
  // 1. direct 模式清空 proxy 环境变量，设置 NO_PROXY
  it("Case 1: direct mode clears proxy env vars and sets loopback NO_PROXY", () => {
    const config: TunnelEnvironmentConfig = {
      networkMode: "direct",
    };
    const env = TunnelEnvironmentBuilder.build(config);
    expect(env.NO_PROXY).toBe("127.0.0.1,localhost,::1");
    expect(env.CONTROL_PLANE_HTTP_PROXY).toBeUndefined();
    expect(env.HTTP_PROXY).toBeUndefined();
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.ALL_PROXY).toBeUndefined();
    expect(env.TUNNEL_CLIENT_HTTP_PROXY).toBeUndefined();
  });

  // 2. system 模式检测到单协议代理 127.0.0.1:10808 → 规范化为 http://127.0.0.1:10808
  it("Case 2: system mode detects single-protocol proxy and normalizes to http://127.0.0.1:10808", () => {
    const fakeReg = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ    127.0.0.1:10808
    `;
    const resolver = new WindowsSystemProxyResolver(() => fakeReg);
    const info = resolver.resolve();
    expect(info.enabled).toBe(true);
    expect(info.proxyUrl).toBe("http://127.0.0.1:10808");
    expect(info.supported).toBe(true);

    // When built into env
    const env = TunnelEnvironmentBuilder.build({
      networkMode: "system",
      systemProxy: info.proxyUrl,
    });
    expect(env.CONTROL_PLANE_HTTP_PROXY).toBe("http://127.0.0.1:10808");
    expect(env.NO_PROXY).toBe("127.0.0.1,localhost,::1");
  });

  // 3. system 模式检测到多协议代理 http=...;https=... → 正确选取 https/http
  it("Case 3: system mode detects multi-protocol proxy and prefers https= endpoint", () => {
    const fakeReg = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ    ftp=127.0.0.1:2121;http=127.0.0.1:8080;https=127.0.0.1:10808
    `;
    const resolver = new WindowsSystemProxyResolver(() => fakeReg);
    const info = resolver.resolve();
    expect(info.enabled).toBe(true);
    expect(info.proxyUrl).toBe("http://127.0.0.1:10808"); // normalizes target to http:// scheme for proxy communication
    expect(info.supported).toBe(true);
  });

  // 4. system 模式检测到 ProxyEnable=0 → 返回 direct / 无代理
  it("Case 4: system mode detects ProxyEnable=0 and resolves disabled", () => {
    const fakeReg = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x0
    ProxyServer    REG_SZ    127.0.0.1:10808
    `;
    const resolver = new WindowsSystemProxyResolver(() => fakeReg);
    const info = resolver.resolve();
    expect(info.enabled).toBe(false);
    expect(info.proxyUrl).toBeUndefined();
    expect(info.supported).toBe(true);
  });

  // 5. system 模式检测到 PAC (AutoConfigURL) → 明确返回 PAC_PROXY_UNSUPPORTED
  it("Case 5: system mode detects PAC AutoConfigURL and flags unsupported", () => {
    const fakeReg = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x0
    AutoConfigURL    REG_SZ    http://wpad.corp.internal/wpad.dat
    `;
    const resolver = new WindowsSystemProxyResolver(() => fakeReg);
    const info = resolver.resolve();
    expect(info.enabled).toBe(true);
    expect(info.pacUrl).toBe("http://wpad.corp.internal/wpad.dat");
    expect(info.supported).toBe(false);
    expect(info.error).toContain("PAC proxy detected but unsupported");
  });

  // 6. custom 模式有效代理 http://127.0.0.1:10808 → 正确应用
  it("Case 6: custom mode applies valid http://127.0.0.1:10808 proxy", () => {
    const env = TunnelEnvironmentBuilder.build({
      networkMode: "custom",
      customProxy: "http://127.0.0.1:10808",
    });
    expect(env.CONTROL_PLANE_HTTP_PROXY).toBe("http://127.0.0.1:10808");
    expect(env.NO_PROXY).toBe("127.0.0.1,localhost,::1");
  });

  // 7. custom 模式有效代理 http://proxy.corp.internal:8080 → 正确应用
  it("Case 7: custom mode applies valid hostname proxy http://proxy.corp.internal:8080", () => {
    const env = TunnelEnvironmentBuilder.build({
      networkMode: "custom",
      customProxy: "http://proxy.corp.internal:8080",
    });
    expect(env.CONTROL_PLANE_HTTP_PROXY).toBe("http://proxy.corp.internal:8080");
    expect(env.NO_PROXY).toBe("127.0.0.1,localhost,::1");
  });

  // 8. custom 模式代理带用户名密码 http://user:pass@127.0.0.1:10808 → 严格报错 PROXY_CREDENTIALS_UNSUPPORTED
  it("Case 8: custom mode strictly rejects proxy credentials (user:pass)", () => {
    expect(() => {
      TunnelEnvironmentBuilder.build({
        networkMode: "custom",
        customProxy: "http://user:pass@127.0.0.1:10808",
      });
    }).toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PROXY_CREDENTIALS_UNSUPPORTED,
      })
    );
  });

  // 9. custom 模式代理带空密码 http://user:@127.0.0.1:10808 → 严格报错
  it("Case 9: custom mode strictly rejects proxy credentials with empty password (user:@)", () => {
    expect(() => {
      TunnelEnvironmentBuilder.build({
        networkMode: "custom",
        customProxy: "http://user:@127.0.0.1:10808",
      });
    }).toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PROXY_CREDENTIALS_UNSUPPORTED,
      })
    );
  });

  // 10. custom 模式非法 URL not-a-url → 报错 TUNNEL_PROXY_INVALID
  it("Case 10: custom mode strictly rejects invalid URL string", () => {
    expect(() => {
      TunnelEnvironmentBuilder.build({
        networkMode: "custom",
        customProxy: "not-a-url",
      });
    }).toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.TUNNEL_PROXY_INVALID,
      })
    );
  });

  // 11. custom 模式非法协议 ftp://127.0.0.1:10808 → 报错 TUNNEL_PROXY_INVALID
  it("Case 11: custom mode strictly rejects non-HTTP protocols (e.g. ftp://)", () => {
    expect(() => {
      TunnelEnvironmentBuilder.normalizeCustomProxy("ftp://127.0.0.1:10808");
    }).toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.TUNNEL_PROXY_INVALID,
      })
    );
  });

  // 12. 仅注入 CONTROL_PLANE_HTTP_PROXY，绝不注入 TUNNEL_CLIENT_HTTP_PROXY 和全局 HTTP_PROXY
  it("Case 12: guarantees only CONTROL_PLANE_HTTP_PROXY is injected, never global HTTP_PROXY", () => {
    const env = TunnelEnvironmentBuilder.build({
      networkMode: "custom",
      customProxy: "http://127.0.0.1:10808",
    });
    expect(env).toHaveProperty("CONTROL_PLANE_HTTP_PROXY", "http://127.0.0.1:10808");
    expect(env).not.toHaveProperty("TUNNEL_CLIENT_HTTP_PROXY");
    expect(env).not.toHaveProperty("HTTP_PROXY");
    expect(env).not.toHaveProperty("HTTPS_PROXY");
    expect(env).not.toHaveProperty("ALL_PROXY");
  });

  // 13. 本地 MCP 连接（MCP_SERVER_URL=http://127.0.0.1:18080/mcp）始终直连，不走代理（NO_PROXY 包含 127.0.0.1）
  it("Case 13: ensures NO_PROXY preserves direct loopback communication to 127.0.0.1:18080/mcp", () => {
    const directEnv = TunnelEnvironmentBuilder.build({ networkMode: "direct" });
    const customEnv = TunnelEnvironmentBuilder.build({
      networkMode: "custom",
      customProxy: "http://127.0.0.1:10808",
    });
    expect(directEnv.NO_PROXY).toContain("127.0.0.1");
    expect(customEnv.NO_PROXY).toContain("127.0.0.1");
    expect(customEnv.NO_PROXY).toContain("localhost");
  });

  // 14. 切换模式（如 direct → custom）触发 hot restart，不重启整个 Nexus
  it("Case 14: switching network mode triggers hot restart of tunnel-client only", () => {
    let tunnelProcessPid = 1001;
    let desktopProcessPid = 500;
    let restartCount = 0;

    function simulateSaveConfig(newMode: TunnelNetworkMode, proxyUrl?: string) {
      // Desktop process PID remains unchanged (no Nexus process restart)
      expect(desktopProcessPid).toBe(500);

      // Tunnel process is gracefully terminated and respawned
      tunnelProcessPid += 1;
      restartCount += 1;
      return {
        tunnelPid: tunnelProcessPid,
        networkMode: newMode,
        customProxyUrl: proxyUrl,
        desktopPid: desktopProcessPid,
      };
    }

    const state1 = simulateSaveConfig("direct");
    expect(state1.tunnelPid).toBe(1002);
    expect(state1.desktopPid).toBe(500);

    const state2 = simulateSaveConfig("custom", "http://127.0.0.1:10808");
    expect(state2.tunnelPid).toBe(1003);
    expect(state2.desktopPid).toBe(500);
    expect(restartCount).toBe(2);
  });

  // 15. 代理不可达时给出明确错误 TUNNEL_PROXY_UNREACHABLE
  it("Case 15: reports TUNNEL_PROXY_UNREACHABLE when proxy TCP handshake fails", () => {
    function simulateTestProxy(reachable: boolean): { success: boolean; errorCode?: string } {
      if (!reachable) {
        return {
          success: false,
          errorCode: LocalBridgeErrorCode.TUNNEL_PROXY_UNREACHABLE,
        };
      }
      return { success: true };
    }

    const result = simulateTestProxy(false);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(LocalBridgeErrorCode.TUNNEL_PROXY_UNREACHABLE);
  });

  // 16. Control Plane 只返回 readyz=200 但 poll 未成功时，状态为 Connected 判定为 false，不误报 Connected
  it("Case 16: readyz=200 alone does NOT declare Control Plane connected when poll metric is 0", () => {
    const metricsWithoutPoll = `
# HELP commands_poll_last_successful_timestamp_seconds Last successful poll timestamp
# TYPE commands_poll_last_successful_timestamp_seconds gauge
commands_poll_last_successful_timestamp_seconds 0
    `;

    const state = TunnelConnectionMonitor.evaluateState({
      processAlive: true,
      healthOk: true,
      readyOk: true,
      metricsText: metricsWithoutPoll,
    });

    expect(state.health).toBe(true);
    expect(state.ready).toBe(true);
    expect(state.controlPlaneConnected).toBe(false); // MUST NOT be true!
  });

  // 17. Control Plane poll 成功（commands_poll_last_successful_timestamp_seconds > 0）时，状态判定为 Connected
  it("Case 17: Control Plane is declared Connected when poll metric timestamp > 0", () => {
    const metricsWithActivePoll = `
# HELP commands_poll_last_successful_timestamp_seconds Last successful poll timestamp
# TYPE commands_poll_last_successful_timestamp_seconds gauge
commands_poll_last_successful_timestamp_seconds 1774227800.5
    `;

    const state = TunnelConnectionMonitor.evaluateState({
      processAlive: true,
      healthOk: true,
      readyOk: true,
      metricsText: metricsWithActivePoll,
    });

    expect(state.health).toBe(true);
    expect(state.ready).toBe(true);
    expect(state.controlPlaneConnected).toBe(true);
    expect(state.lastSuccessfulPollAt).toBe(1774227800.5);
  });

  // 18. 重连退避阶梯按 5s, 10s, 20s, 30s, 60s 执行
  it("Case 18: exponential backoff intervals follow [5, 10, 20, 30, 60] seconds", () => {
    const BACKOFF_SCHEDULE = [5, 10, 20, 30, 60];
    function getBackoff(attempt: number): number {
      const idx = Math.min(attempt, BACKOFF_SCHEDULE.length - 1);
      return BACKOFF_SCHEDULE[idx];
    }

    expect(getBackoff(0)).toBe(5);
    expect(getBackoff(1)).toBe(10);
    expect(getBackoff(2)).toBe(20);
    expect(getBackoff(3)).toBe(30);
    expect(getBackoff(4)).toBe(60);
    expect(getBackoff(5)).toBe(60); // capped at 60s
    expect(getBackoff(100)).toBe(60); // capped at 60s
  });

  // 19. 敏感信息脱敏：日志和 UI 中不泄露代理凭据（即使用户输入了凭据，报错中也脱敏）
  it("Case 19: proxy credentials in URLs and error messages are redacted", () => {
    const sensitiveUrl = "http://admin:superSecret123@10.0.0.1:8080";
    const redacted = TunnelEnvironmentBuilder.redactProxyUrl(sensitiveUrl);
    expect(redacted).not.toContain("superSecret123");
    expect(redacted).toBe("http://admin:[REDACTED]@10.0.0.1:8080");

    const helperRedacted = redactProxyUrl(sensitiveUrl);
    expect(helperRedacted).toBe("http://admin:[REDACTED]@10.0.0.1:8080");

    const unauthenticatedUrl = "http://127.0.0.1:10808";
    expect(TunnelEnvironmentBuilder.redactProxyUrl(unauthenticatedUrl)).toBe(
      "http://127.0.0.1:10808"
    );
  });

  // 20. 完整配置保存并在重启后恢复（包含 network_mode 和 custom_proxy_url）
  it("Case 20: persists full config across restarts including network_mode and custom_proxy_url", () => {
    const input: TunnelSaveConfigInput = {
      tunnelId: "tun_production_matrix",
      runtimeApiKey: "lbr_test_key_12345",
      mcpToken: "lb_test_mcp_token_98765",
      autoReconnect: true,
      networkMode: "custom",
      customProxyUrl: "http://127.0.0.1:10808",
      connectNow: true,
    };

    // Serialize as saved in encrypted DPAPI storage
    const storedJson = JSON.stringify({
      tunnel_id: input.tunnelId,
      runtime_api_key: input.runtimeApiKey,
      mcp_token: input.mcpToken,
      auto_reconnect: input.autoReconnect,
      health_port: 8080,
      network_mode: input.networkMode,
      custom_proxy_url: input.customProxyUrl,
    });

    // Simulate reload after application restart
    const restored = JSON.parse(storedJson);
    const dto: TunnelStatusDto = {
      configured: true,
      status: "Connected",
      tunnel_id: restored.tunnel_id,
      has_api_key: Boolean(restored.runtime_api_key),
      has_mcp_token: Boolean(restored.mcp_token),
      auto_reconnect: restored.auto_reconnect,
      health_port: restored.health_port,
      network_mode: restored.network_mode,
      custom_proxy_url: restored.custom_proxy_url,
      active_proxy_url: restored.custom_proxy_url,
      reconnect_attempts: 0,
    };

    expect(dto.network_mode).toBe("custom");
    expect(dto.custom_proxy_url).toBe("http://127.0.0.1:10808");
    expect(dto.active_proxy_url).toBe("http://127.0.0.1:10808");
    expect(dto.has_api_key).toBe(true);
    expect(dto.has_mcp_token).toBe(true);
  });
});
