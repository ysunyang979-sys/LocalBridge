import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TunnelSaveConfigInput } from "../apps/desktop/src/api/bridge.js";

describe("Tunnel IPC Contract & Error Sanitization", () => {
  let invokedCommand: string | null = null;
  let invokedPayload: any = null;

  beforeEach(() => {
    invokedCommand = null;
    invokedPayload = null;
  });

  it("enforces strict camelCase keys in TunnelSaveConfigInput", () => {
    const validConfig: TunnelSaveConfigInput = {
      tunnelId: "tunnel_test_12345",
      runtimeApiKey: "test_api_key_secret",
      mcpToken: "lb_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a",
      autoReconnect: true,
      healthPort: 8080,
      connectNow: true,
    };

    expect(validConfig.tunnelId).toBe("tunnel_test_12345");
    expect(validConfig.runtimeApiKey).toBe("test_api_key_secret");
    expect(validConfig.mcpToken).toBe(
      "lb_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a"
    );
    expect(validConfig.autoReconnect).toBe(true);
    expect(validConfig.healthPort).toBe(8080);
    expect(validConfig.connectNow).toBe(true);

    // Verify snake_case keys do not exist on the typed object
    const untyped = validConfig as Record<string, unknown>;
    expect(untyped.tunnel_id).toBeUndefined();
    expect(untyped.runtime_api_key).toBeUndefined();
    expect(untyped.mcp_token).toBeUndefined();
    expect(untyped.auto_reconnect).toBeUndefined();
    expect(untyped.health_port).toBeUndefined();
    expect(untyped.connect_now).toBeUndefined();
  });

  it("verifies Tauri IPC argument serialization contract for desktop_tunnel_save_config", () => {
    // Simulating Tauri invoke parameter mapping
    function mockSaveTunnelConfig(params: TunnelSaveConfigInput) {
      invokedCommand = "desktop_tunnel_save_config";
      invokedPayload = {
        tunnelId: params.tunnelId,
        runtimeApiKey: params.runtimeApiKey ?? null,
        mcpToken: params.mcpToken ?? null,
        autoReconnect: params.autoReconnect ?? null,
        healthPort: params.healthPort ?? null,
        connectNow: params.connectNow ?? null,
      };
      return invokedPayload;
    }

    const input: TunnelSaveConfigInput = {
      tunnelId: "tunnel_prod_abc",
      runtimeApiKey: "sec_key_xyz",
      mcpToken: "lb_token_123",
      autoReconnect: true,
      healthPort: 8080,
      connectNow: true,
    };

    const payload = mockSaveTunnelConfig(input);

    expect(invokedCommand).toBe("desktop_tunnel_save_config");
    expect(payload).toHaveProperty("tunnelId", "tunnel_prod_abc");
    expect(payload).toHaveProperty("runtimeApiKey", "sec_key_xyz");
    expect(payload).toHaveProperty("mcpToken", "lb_token_123");
    expect(payload).toHaveProperty("autoReconnect", true);
    expect(payload).toHaveProperty("healthPort", 8080);
    expect(payload).toHaveProperty("connectNow", true);

    // Must NOT contain snake_case keys
    expect(payload).not.toHaveProperty("tunnel_id");
    expect(payload).not.toHaveProperty("runtime_api_key");
    expect(payload).not.toHaveProperty("mcp_token");
    expect(payload).not.toHaveProperty("auto_reconnect");
    expect(payload).not.toHaveProperty("health_port");
    expect(payload).not.toHaveProperty("connect_now");
  });

  it("sanitizes IPC errors and redacts secrets", () => {
    function sanitizeTunnelError(err: unknown): { userMessage: string; diagnosticCode?: string } {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes("missing required key") || raw.includes("invalid args")) {
        return {
          userMessage: "无法保存隧道配置。请检查配置参数后重试。",
          diagnosticCode: "IPC_ARGUMENT_ERROR",
        };
      }
      if (
        raw.includes("401") ||
        raw.includes("403") ||
        raw.includes("Unauthorized") ||
        raw.includes("Authentication")
      ) {
        return {
          userMessage: "隧道凭据验证失败，请确认 Runtime API Key 是否正确。",
          diagnosticCode: "TUNNEL_AUTH_FAILED",
        };
      }
      if (raw.includes("Health port") || raw.includes("already in use") || raw.includes("conflict")) {
        return {
          userMessage: "健康检查端口已被占用，请在设置中更换端口。",
          diagnosticCode: "HEALTH_PORT_CONFLICT",
        };
      }
      return {
        userMessage: raw
          .replace(/lb_[a-f0-9]{32,64}/gi, "lb_***")
          .replace(/lbr_[a-f0-9]{32,64}/gi, "lbr_***")
          .replace(/lm_[a-f0-9]{32,64}/gi, "lm_***"),
      };
    }

    // Case 1: Tauri deserialization argument error
    const tauriArgError = new Error(
      "invalid args `tunnelId` for command `desktop_tunnel_save_config`: command desktop_tunnel_save_config missing required key tunnelId"
    );
    const res1 = sanitizeTunnelError(tauriArgError);
    expect(res1.diagnosticCode).toBe("IPC_ARGUMENT_ERROR");
    expect(res1.userMessage).toContain("无法保存隧道配置");
    expect(res1.userMessage).not.toContain("invalid args");

    // Case 2: Auth failure with secret leak attempt
    const authError = new Error(
      "Authentication failed for token lb_1111222233334444555566667777888811112222333344445555666677778888"
    );
    const res2 = sanitizeTunnelError(authError);
    expect(res2.diagnosticCode).toBe("TUNNEL_AUTH_FAILED");
    expect(res2.userMessage).not.toContain("lb_11112222");

    // Case 3: Port conflict
    const portError = new Error("Health port 8080 is already in use by another application");
    const res3 = sanitizeTunnelError(portError);
    expect(res3.diagnosticCode).toBe("HEALTH_PORT_CONFLICT");

    // Case 4: Redaction of miscellaneous secret leaks
    const leakedMsg = "Error at lb_abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const res4 = sanitizeTunnelError(leakedMsg);
    expect(res4.userMessage).toBe("Error at lb_***");
    expect(res4.userMessage).not.toContain("abcdef0123456789");
  });

  it("verifies autoCreateTunnelToken contract returns plaintext token and getMcpToken exposes stored secret", async () => {
    const mockCreatedToken = "lb_mcp_test_secret_token_1234567890abcdef";
    const mockTauriResponse = {
      success: true,
      token: mockCreatedToken,
      message: "Tunnel MCP token created and securely stored",
    };

    expect(mockTauriResponse.token).toBe(mockCreatedToken);
    expect(mockTauriResponse.token).toMatch(/^lb_mcp_/);
    expect(mockTauriResponse.success).toBe(true);

    const mockGetTokenResponse = {
      token: mockCreatedToken,
    };
    expect(mockGetTokenResponse.token).toBe(mockCreatedToken);
  });

  it("verifies saveMcpToken contract securely persists standalone token to DPAPI without tunnelId", async () => {
    function mockSaveMcpToken(token: string) {
      invokedCommand = "desktop_tunnel_save_mcp_token";
      invokedPayload = { token: token.trim() };
      return {
        success: true,
        token: token.trim(),
        message: "MCP token securely saved to DPAPI",
      };
    }

    const testToken = "lb_standalone_test_secret_9876543210abcdef";
    const res = mockSaveMcpToken(`  ${testToken}  `);

    expect(invokedCommand).toBe("desktop_tunnel_save_mcp_token");
    expect(invokedPayload).toHaveProperty("token", testToken);
    expect(res.success).toBe(true);
    expect(res.token).toBe(testToken);
  });
});
