import { describe, it, expect } from "vitest";
import { sanitizeString, sanitizeDecisionContext } from "../packages/security/src/intelligence/redaction.js";
import type { DecisionContext } from "@localbridge/protocol";

describe("Laya Decision Input Redaction Engine Suite", () => {
  it("strictly redacts runtime tokens and MCP session credentials (lb_, lbr_, lm_)", () => {
    const rawTokens = [
      "lb_a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4",
      "lbr_0123456789abcdef0123456789abcdef01234567",
      "lm_abcdef0123456789abcdef0123456789abcdef01",
    ];

    for (const token of rawTokens) {
      const sanitized = sanitizeString(`Session with ${token} for user`);
      expect(sanitized).not.toContain(token);
      expect(sanitized).toContain("[REDACTED_TOKEN]");
    }
  });

  it("redacts Bearer tokens, API keys, and passwords from commands and arguments", () => {
    const sample = 'curl -H "Authorization: Bearer my-secret-jwt-token-12345" https://api.example.com --data "password=SuperSecret123!"';
    const sanitized = sanitizeString(sample);

    expect(sanitized).not.toContain("my-secret-jwt-token-12345");
    expect(sanitized).not.toContain("SuperSecret123!");
    expect(sanitized).toContain("[REDACTED_TOKEN]");
    expect(sanitized).toContain("[REDACTED_SECRET]");
  });

  it("redacts sensitive credential file paths (.env, id_rsa, .aws/credentials, .kube/config)", () => {
    expect(sanitizeString("cat /home/user/.env")).toContain("[REDACTED_ENV]");
    expect(sanitizeString("cat /home/user/.env.production")).toContain("[REDACTED_ENV]");
    expect(sanitizeString("cp ~/.ssh/id_rsa /tmp/key")).toContain("[REDACTED_SSH_KEY]");
    expect(sanitizeString("open .aws/credentials")).toContain("[REDACTED_AWS_CREDENTIALS]");
    expect(sanitizeString("view ~/.kube/config")).toContain("[REDACTED_KUBE_CONFIG]");
  });

  it("preserves non-sensitive operational commands and technical identifiers", () => {
    const normalCmd = "git status --porcelain -b";
    expect(sanitizeString(normalCmd)).toBe(normalCmd);

    const buildCmd = "pnpm --filter @localbridge/desktop build";
    expect(sanitizeString(buildCmd)).toBe(buildCmd);
  });

  it("guarantees zero leakage of file contents and raw body payloads in DecisionContext", () => {
    const rawContext: DecisionContext = {
      operation: "file.write",
      toolName: "filesystem",
      projectId: "proj_abc123",
      projectName: "my-web-app",
      accessMode: "read-write",
      executionMode: "safe-only",
      trustLevel: "standard",
      pathType: "relative",
      command: "node server.js",
      args: ["--token", "lb_1234567890abcdef1234567890abcdef"],
      content: "const SECRET_KEY = 'super_secret_raw_code';",
      fileContent: "PRIVATE USER CERTIFICATE DATA",
      body: "{\"apiKey\": \"sk-ant-12345\"}",
      patch: "--- a/config.ts\n+++ b/config.ts\n+const PASS = '123';",
      diff: "diff --git a/keys b/keys",
      credentials: "user:password",
    };

    const sanitized = sanitizeDecisionContext(rawContext);

    // Omitted raw data fields
    expect((sanitized as any).content).toBeUndefined();
    expect((sanitized as any).fileContent).toBeUndefined();
    expect((sanitized as any).body).toBeUndefined();
    expect((sanitized as any).patch).toBeUndefined();
    expect((sanitized as any).diff).toBeUndefined();
    expect((sanitized as any).credentials).toBeUndefined();

    // Sanitized token inside args
    expect(sanitized.args?.[1]).toBe("[REDACTED_TOKEN]");

    // Operational metadata preserved
    expect(sanitized.operation).toBe("file.write");
    expect(sanitized.projectId).toBe("proj_abc123");
    expect(sanitized.projectName).toBe("my-web-app");
    expect(sanitized.accessMode).toBe("read-write");
  });
});
