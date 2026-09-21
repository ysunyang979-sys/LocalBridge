import { describe, it, expect } from "vitest";
import { KimiAuthTraceCollector } from "../apps/server/src/auth/kimi-auth-trace.js";

describe("Kimi Auth Redaction Security Suite (kimi-auth-redaction.test)", () => {
  it("strictly redacts sensitive tokens, bearer headers, and client secrets from trace entries", () => {
    const collector = new KimiAuthTraceCollector();
    const sensitiveToken = "lb_kimi_supersecrettoken_1234567890abcdef";

    collector.record({
      stage: "mcp-request",
      method: "POST",
      path: "/mcp",
      statusCode: 200,
      authorizationPresent: true,
      clientId: "conn_kimi_web",
      rawAuthHeader: `Bearer ${sensitiveToken}`,
    } as any);

    const entries = collector.getEntries();
    expect(entries.length).toBe(1);

    const json = JSON.stringify(entries[0]);
    expect(json).not.toContain(sensitiveToken);
    expect(entries[0].authorizationPresent).toBe(true);

    const summary = collector.formatSummary();
    expect(summary).not.toContain(sensitiveToken);
  });
});
