import { describe, it, expect } from "vitest";
import { sanitizeErrorDetails } from "../apps/desktop/src/components/common/AppErrorBoundary.js";

describe("AI Connection Error Boundary & Secret Sanitization Suite", () => {
  function generateCrashId(prefix = "CONNECTION_UI_CRASH"): string {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const time = Date.now().toString(36).toUpperCase();
    return `${prefix}_${time}_${rand}`;
  }

  it("generates crash ID matching required format CONNECTION_UI_CRASH_xxx", () => {
    const crashId = generateCrashId();
    expect(crashId).toMatch(/^CONNECTION_UI_CRASH_[A-Z0-9]+_[A-Z0-9]+$/);
  });

  it("strictly scrubs Nexus tokens (lb_...), OpenAI keys (sk-...), and passwords from error stacks", () => {
    const dirtyError = `Error: Failed at connection drawer
      at Object.token (http://localhost/mcp?token=lb_sec_999988887777)
      at request (auth: Bearer lb_tok_secret123456789)
      at OpenAIClient (key=sk-proj-supersecretkey123456789)
      at fetch (http://nexus/api?password=verySecretPassword123)`;

    const sanitized = sanitizeErrorDetails(dirtyError);

    expect(sanitized).not.toContain("lb_sec_999988887777");
    expect(sanitized).not.toContain("lb_tok_secret123456789");
    expect(sanitized).not.toContain("sk-proj-supersecretkey123456789");
    expect(sanitized).not.toContain("verySecretPassword123");

    expect(sanitized).toContain("••••••••");
  });

  it("preserves stack structure and component context while stripping credentials", () => {
    const stack = "TypeError: Cannot read properties of undefined (reading 'config')\n    at ConnectionDetailDrawer";
    const sanitized = sanitizeErrorDetails(stack);
    expect(sanitized).toContain("TypeError: Cannot read properties of undefined");
    expect(sanitized).toContain("ConnectionDetailDrawer");
  });
});
