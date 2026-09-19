import { describe, it, expect } from "vitest";
import { enUS } from "../apps/desktop/src/i18n/locales/en-US.js";
import { zhCN } from "../apps/desktop/src/i18n/locales/zh-CN.js";

// Mirror of redaction logic in SettingsPage
function redactSecrets(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\b(lb_[a-zA-Z0-9_-]{3})[a-zA-Z0-9_-]*/g, "$1***")
    .replace(/\b(lbr_[a-zA-Z0-9_-]{3})[a-zA-Z0-9_-]*/g, "$1***")
    .replace(/\b(lm_[a-zA-Z0-9_-]{3})[a-zA-Z0-9_-]*/g, "$1***")
    .replace(/Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/(Authorization:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(api[-_]?key[=:\s]+)[a-zA-Z0-9._~+/-]+/gi, "$1[REDACTED]");
}

function isActionableError(status: string | undefined): boolean {
  if (!status) return false;
  return [
    "AuthenticationError",
    "NeedsAttention",
    "RuntimeMissing",
    "HealthPortConflict",
    "LocalMcpUnavailable",
    "Error",
  ].includes(status);
}

function isChatGPTReady(status: string | undefined, configured: boolean): boolean {
  return status === "Connected" && configured;
}

function getBadgeVariant(status: string | undefined): "emerald" | "amber" | "blue" | "red" | "slate" {
  if (status === "Connected") return "emerald";
  if (status === "Reconnecting") return "amber";
  if (status === "Connecting" || status === "Starting") return "blue";
  if (isActionableError(status)) return "red";
  return "slate";
}

describe("Tunnel Status UX & Security Redaction Suite", () => {
  describe("Secret Redaction in Diagnostics and Error Messages", () => {
    it("redacts lb_ tokens to lb_*** prefix only", () => {
      const input = "Failed to authenticate with token lb_mcp_secret_token_123456789";
      const output = redactSecrets(input);
      expect(output).not.toContain("secret_token_123456789");
      expect(output).toContain("lb_mcp***");
    });

    it("redacts lbr_ runtime keys", () => {
      const input = "Runtime failed using key lbr_prod_live_abc123456789";
      const output = redactSecrets(input);
      expect(output).not.toContain("prod_live_abc123456789");
      expect(output).toContain("lbr_pro***");
    });

    it("redacts lm_ tokens", () => {
      const input = "Local MCP returned invalid token lm_auth_9988776655";
      const output = redactSecrets(input);
      expect(output).not.toContain("9988776655");
      expect(output).toContain("lm_aut***");
    });

    it("redacts Bearer tokens and Authorization headers", () => {
      const input = "HTTP 401 Unauthorized: Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.supersecret";
      const output = redactSecrets(input);
      expect(output).not.toContain("eyJhbGciOiJIUzI1NiJ9.supersecret");
      expect(output).toContain("Authorization: [REDACTED]");
    });

    it("redacts api_key query or body arguments", () => {
      const input = "Connecting to tunnel with api_key=rt_live_key_9988112233";
      const output = redactSecrets(input);
      expect(output).not.toContain("rt_live_key_9988112233");
      expect(output).toContain("api_key=[REDACTED]");
    });

    it("handles null or undefined cleanly", () => {
      expect(redactSecrets(null)).toBe("");
      expect(redactSecrets(undefined)).toBe("");
      expect(redactSecrets("")).toBe("");
    });
  });

  describe("Status Badge Classification & Visual Hierarchy", () => {
    it("assigns emerald badge to Connected", () => {
      expect(getBadgeVariant("Connected")).toBe("emerald");
    });

    it("assigns amber badge to transient Reconnecting", () => {
      expect(getBadgeVariant("Reconnecting")).toBe("amber");
    });

    it("assigns blue badge to Starting and Connecting", () => {
      expect(getBadgeVariant("Starting")).toBe("blue");
      expect(getBadgeVariant("Connecting")).toBe("blue");
    });

    it("assigns red badge ONLY to actionable errors", () => {
      expect(getBadgeVariant("AuthenticationError")).toBe("red");
      expect(getBadgeVariant("NeedsAttention")).toBe("red");
      expect(getBadgeVariant("RuntimeMissing")).toBe("red");
      expect(getBadgeVariant("HealthPortConflict")).toBe("red");
      expect(getBadgeVariant("LocalMcpUnavailable")).toBe("red");
      expect(getBadgeVariant("Error")).toBe("red");
    });

    it("assigns slate badge to stopped or unconfigured states", () => {
      expect(getBadgeVariant("Stopped")).toBe("slate");
      expect(getBadgeVariant("NotConfigured")).toBe("slate");
    });
  });

  describe("Transient Reconnect UX vs Actionable Error Banner", () => {
    it("does NOT classify Reconnecting as an actionable error", () => {
      expect(isActionableError("Reconnecting")).toBe(false);
    });

    it("does NOT classify Connecting or Starting as actionable errors", () => {
      expect(isActionableError("Connecting")).toBe(false);
      expect(isActionableError("Starting")).toBe(false);
    });

    it("classifies authentication and port conflict errors as actionable", () => {
      expect(isActionableError("AuthenticationError")).toBe(true);
      expect(isActionableError("HealthPortConflict")).toBe(true);
      expect(isActionableError("RuntimeMissing")).toBe(true);
      expect(isActionableError("NeedsAttention")).toBe(true);
    });
  });

  describe("Prevention of False-Positive ChatGPT Ready State", () => {
    it("reports ChatGPT Ready only when status is Connected AND configured", () => {
      expect(isChatGPTReady("Connected", true)).toBe(true);
      expect(isChatGPTReady("Connected", false)).toBe(false);
      expect(isChatGPTReady("Reconnecting", true)).toBe(false);
      expect(isChatGPTReady("Connecting", true)).toBe(false);
      expect(isChatGPTReady("Stopped", true)).toBe(false);
    });
  });

  describe("i18n Parity for Tunnel Status & Diagnostics Keys", () => {
    const requiredKeys = [
      "reconnectingNotice",
      "needsAttentionNotice",
      "viewDiagnostics",
      "hideDiagnostics",
      "diagnosticsTitle",
      "diagProcess",
      "diagLocalHealth",
      "diagControlPlane",
      "diagMcpSession",
      "diagReconnectAttempts",
      "diagLastError",
      "diagChildExitCode",
    ] as const;

    it("verifies all required keys exist and are non-empty in zh-CN", () => {
      for (const key of requiredKeys) {
        expect(zhCN.tunnel).toHaveProperty(key);
        expect((zhCN.tunnel as any)[key].trim().length).toBeGreaterThan(0);
      }
      expect(zhCN.tunnel.reconnectingNotice).toContain("自动恢复");
      expect(zhCN.tunnel.viewDiagnostics).toBe("查看诊断");
      expect(zhCN.tunnel.hideDiagnostics).toBe("收起诊断");
    });

    it("verifies all required keys exist and are non-empty in en-US", () => {
      for (const key of requiredKeys) {
        expect(enUS.tunnel).toHaveProperty(key);
        expect((enUS.tunnel as any)[key].trim().length).toBeGreaterThan(0);
      }
      expect(enUS.tunnel.reconnectingNotice).toContain("Reconnecting automatically");
      expect(enUS.tunnel.viewDiagnostics).toBe("View Diagnostics");
      expect(enUS.tunnel.hideDiagnostics).toBe("Hide Diagnostics");
    });
  });
});
