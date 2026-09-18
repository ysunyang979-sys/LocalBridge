import { describe, it, expect } from "vitest";
import {
  generateMcpToken,
  generateRunnerToken,
  getTokenType,
  hashToken,
  verifyToken,
  sha256,
} from "@localbridge/shared";

describe("Crypto & Token Security", () => {
  it("generates MCP tokens with lb_ prefix and high entropy", () => {
    const token = generateMcpToken();
    expect(token.startsWith("lb_")).toBe(true);
    expect(token.length).toBe(3 + 64); // "lb_" + 64 hex characters (32 bytes)
    expect(getTokenType(token)).toBe("mcp");
  });

  it("generates Runner tokens with lbr_ prefix and high entropy", () => {
    const token = generateRunnerToken();
    expect(token.startsWith("lbr_")).toBe(true);
    expect(token.length).toBe(4 + 64); // "lbr_" + 64 hex characters (32 bytes)
    expect(getTokenType(token)).toBe("runner");
  });

  it("hashes and verifies tokens correctly", () => {
    const rawToken = generateMcpToken();
    const hash = hashToken(rawToken);

    // Hash is 64 hex chars
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyToken(rawToken, hash)).toBe(true);
    expect(verifyToken(rawToken + "x", hash)).toBe(false);
    expect(verifyToken("other_token", hash)).toBe(false);
  });

  it("hashes content with sha256 helper", () => {
    const hash1 = sha256("hello world");
    const hash2 = sha256("hello world");
    const hash3 = sha256("different");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
  });
});
