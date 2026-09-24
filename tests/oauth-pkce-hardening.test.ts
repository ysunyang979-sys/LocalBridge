import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { OAuthStore } from "../apps/bridge/src/oauth.js";

const TEST_PORT = 18789;
const BRIDGE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe("Commit 2: Mandatory PKCE & RFC 7636 Hardening", () => {
  beforeAll(async () => {
    process.env.PORT = String(TEST_PORT);
    process.env.NEXUS_BRIDGE_PORT = String(TEST_PORT);
    process.env.LOCALBRIDGE_MANAGEMENT_TOKEN = "lm_pkce_hardening_token_9876543210";

    await import("../apps/bridge/src/index.js");

    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${BRIDGE_URL}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });

  const validVerifier = "E9Melhoa2OwvFrGMTJguCH5rtG6j30-CzUMq-3FF8UU_test_pkce"; // 53 chars, valid charset
  const validChallenge = crypto.createHash("sha256").update(validVerifier).digest("base64url");

  describe("GET /oauth/authorize PKCE Enforcement", () => {
    it("fails when code_challenge is missing", async () => {
      const res = await fetch(
        `${BRIDGE_URL}/oauth/authorize?client_id=gemini-spark&redirect_uri=https://spark.gemini.google.com/oauth/callback&response_type=code`,
        { redirect: "manual" }
      );
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain("code_challenge");
    });

    it("fails when code_challenge_method is plain", async () => {
      const res = await fetch(
        `${BRIDGE_URL}/oauth/authorize?client_id=gemini-spark&redirect_uri=https://spark.gemini.google.com/oauth/callback&response_type=code&code_challenge=${validChallenge}&code_challenge_method=plain`,
        { redirect: "manual" }
      );
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toMatch(/code_challenge_method|S256/i);
    });

    it("fails when code_challenge_method is missing", async () => {
      const res = await fetch(
        `${BRIDGE_URL}/oauth/authorize?client_id=gemini-spark&redirect_uri=https://spark.gemini.google.com/oauth/callback&response_type=code&code_challenge=${validChallenge}`,
        { redirect: "manual" }
      );
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toMatch(/code_challenge_method|S256/i);
    });

    it("succeeds with valid code_challenge and method=S256", async () => {
      const res = await fetch(
        `${BRIDGE_URL}/oauth/authorize?client_id=gemini-spark&redirect_uri=https://spark.gemini.google.com/oauth/callback&response_type=code&code_challenge=${validChallenge}&code_challenge_method=S256`,
        { redirect: "manual" }
      );
      expect(res.status).toBe(200);
    });
  });

  describe("POST /oauth/authorize PKCE Enforcement", () => {
    it("fails when code_challenge is missing", async () => {
      const res = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          action: "approve",
          code_challenge_method: "S256",
        }),
        redirect: "manual",
      });
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain("code_challenge");
    });

    it("fails when code_challenge_method is plain", async () => {
      const res = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          action: "approve",
          code_challenge: validChallenge,
          code_challenge_method: "plain",
        }),
        redirect: "manual",
      });
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toMatch(/code_challenge_method|S256/i);
    });

    it("fails when code_challenge_method is missing", async () => {
      const res = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          action: "approve",
          code_challenge: validChallenge,
        }),
        redirect: "manual",
      });
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toMatch(/code_challenge_method|S256/i);
    });

    it("accepts valid code_challenge and S256", async () => {
      const res = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "X-Forwarded-For": "203.0.113.10",
        },
        body: new URLSearchParams({
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          action: "approve",
          code_challenge: validChallenge,
          code_challenge_method: "S256",
        }),
        redirect: "manual",
      });
      expect(res.status).toBe(202);
      const data = await res.json() as any;
      expect(data.status).toBe("pending");
    });
  });

  describe("OAuthStore & Token Exchange RFC 7636 Validation", () => {
    it("createAuthorizationCode requires code_challenge and rejects non-S256", () => {
      const store = new OAuthStore();
      expect(() => {
        (store as any).createAuthorizationCode({
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        });
      }).toThrow(/code_challenge/i);

      expect(() => {
        store.createAuthorizationCode({
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          code_challenge: validChallenge,
          code_challenge_method: "plain" as any,
        });
      }).toThrow(/S256/i);
    });

    it("exchangeCode fails when code_verifier is missing", () => {
      const store = new OAuthStore();
      const code = store.createAuthorizationCode({
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_challenge: validChallenge,
        code_challenge_method: "S256",
      });

      const res = store.exchangeCode({
        code,
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/code_verifier/i);
    });

    it("exchangeCode rejects code_verifier shorter than 43 chars", () => {
      const store = new OAuthStore();
      const code = store.createAuthorizationCode({
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_challenge: validChallenge,
        code_challenge_method: "S256",
      });

      const res = store.exchangeCode({
        code,
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_verifier: "a".repeat(42), // 42 chars
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/code_verifier|length|format|RFC 7636/i);
    });

    it("exchangeCode rejects code_verifier longer than 128 chars", () => {
      const store = new OAuthStore();
      const code = store.createAuthorizationCode({
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_challenge: validChallenge,
        code_challenge_method: "S256",
      });

      const res = store.exchangeCode({
        code,
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_verifier: "a".repeat(129), // 129 chars
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/code_verifier|length|format|RFC 7636/i);
    });

    it("exchangeCode rejects code_verifier with invalid characters", () => {
      const store = new OAuthStore();
      const code = store.createAuthorizationCode({
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_challenge: validChallenge,
        code_challenge_method: "S256",
      });

      const res = store.exchangeCode({
        code,
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_verifier: "a".repeat(42) + "@", // contains invalid character '@'
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/code_verifier|length|format|character|RFC 7636/i);
    });

    it("exchangeCode fails when code_verifier does not match challenge", () => {
      const store = new OAuthStore();
      const code = store.createAuthorizationCode({
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_challenge: validChallenge,
        code_challenge_method: "S256",
      });

      const wrongVerifier = "B".repeat(50);
      const res = store.exchangeCode({
        code,
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_verifier: wrongVerifier,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/PKCE|mismatch/i);
    });

    it("exchangeCode succeeds when valid code_verifier matches S256 challenge", () => {
      const store = new OAuthStore();
      const code = store.createAuthorizationCode({
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_challenge: validChallenge,
        code_challenge_method: "S256",
      });

      const res = store.exchangeCode({
        code,
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_verifier: validVerifier,
      });

      expect(res.success).toBe(true);
      expect(res.tokenResponse?.access_token).toBeDefined();
    });
  });

  describe("HTTP POST /oauth/token endpoint PKCE verification", () => {
    it("fails token exchange without code_verifier", async () => {
      // Direct issuance is removed: even with Bearer admin token, POST /oauth/authorize must return 202 pending
      const authRes = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: "Bearer lm_pkce_hardening_token_9876543210",
        },
        body: new URLSearchParams({
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          action: "approve",
          code_challenge: validChallenge,
          code_challenge_method: "S256",
        }),
        redirect: "manual",
      });
      expect(authRes.status).toBe(202);
      const pendingData = (await authRes.json()) as any;
      expect(pendingData.status).toBe("pending");
      expect(authRes.headers.get("location")).toBeNull();

      // Resolve via loopback with pairing code to get authorization code
      const resolveRes = await fetch(`${BRIDGE_URL}/oauth/requests/${pendingData.requestId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer lm_pkce_hardening_token_9876543210",
        },
        body: JSON.stringify({
          action: "approve",
          pairing_code: pendingData.pairingCode || pendingData.pairing_code,
        }),
      });
      expect(resolveRes.status).toBe(200);
      const resolveData = (await resolveRes.json()) as any;
      const code = resolveData.code;
      expect(code).toBeDefined();

      const res = await fetch(`${BRIDGE_URL}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          code,
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toMatch(/code_verifier/i);
    });
  });
});
