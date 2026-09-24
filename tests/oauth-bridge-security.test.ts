import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import { isRedirectUriAllowed, OAuthStore } from "../apps/bridge/src/oauth.js";

const TEST_PORT = 18787;
const BRIDGE_URL = `http://127.0.0.1:${TEST_PORT}`;
const testVerifier = "E9Melhoa2OwvFrGMTJguCH5rtG6j30-CzUMq-3FF8UU_test_pkce";
const testChallenge = crypto.createHash("sha256").update(testVerifier).digest("base64url");

describe("P0 OAuth Bridge Security Regressions", () => {
  let bridgeProcess: any = null;

  beforeAll(async () => {
    process.env.PORT = String(TEST_PORT);
    process.env.NEXUS_BRIDGE_PORT = String(TEST_PORT);
    process.env.LOCALBRIDGE_MANAGEMENT_TOKEN = "lm_test_management_secret_1234567890";
    
    // Import server module which starts listening on TEST_PORT
    await import("../apps/bridge/src/index.js");
    
    // Wait for server to be responsive
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${BRIDGE_URL}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });

  // 1. redirect_uri whitelist: trycloudflare wildcard MUST be removed
  it("rejects attacker-controlled trycloudflare.com redirect_uri", () => {
    const attackerUri = "https://evil-attacker.trycloudflare.com/oauth/callback";
    const allowed = isRedirectUriAllowed(attackerUri);
    // On unpatched code, this returns true because of *.trycloudflare.com wildcard.
    // Security requirement: MUST be false!
    expect(allowed).toBe(false);
  });

  // 2. /oauth/token: redirect_uri is mandatory and must match if provided during authorization
  it("fails code exchange if redirect_uri was in auth request but omitted in token request", () => {
    const store = new OAuthStore();
    const code = store.createAuthorizationCode({
      client_id: "gemini-spark",
      redirect_uri: "https://spark.gemini.google.com/oauth/callback",
      code_challenge: testChallenge,
      code_challenge_method: "S256",
    });

    // Exchange without redirect_uri parameter
    const res = store.exchangeCode({
      code,
      client_id: "gemini-spark",
      code_verifier: testVerifier,
    });

    // On unpatched code, omitting redirect_uri succeeds!
    // Security requirement: MUST fail if redirect_uri was in auth request!
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/redirect_uri/i);
  });

  // 3. /oauth/authorize consent screen anti-embedding headers
  it("includes X-Frame-Options and Content-Security-Policy frame-ancestors headers on consent page", async () => {
    const res = await fetch(
      `${BRIDGE_URL}/oauth/authorize?client_id=gemini-spark&redirect_uri=https://spark.gemini.google.com/oauth/callback&response_type=code`,
      { redirect: "manual" }
    );
    const xfo = res.headers.get("x-frame-options");
    const csp = res.headers.get("content-security-policy");

    // On unpatched code, neither header is present
    expect(xfo).toBe("DENY");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  // 4. POST /oauth/authorize default action must be DENIED, not approved
  it("rejects authorization when action parameter is missing (default deny)", async () => {
    const res = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        // action omitted!
      }),
      redirect: "manual",
    });

    const location = res.headers.get("location") || "";
    // On unpatched code, omitting action defaults to approve and issues ?code=...
    // Security requirement: MUST NOT issue code, must be access_denied
    expect(location).not.toContain("code=oa_code_");
    expect(location).toContain("error=access_denied");
  });

  // 5. POST /oauth/authorize public request cannot directly obtain authorization code
  it("does not directly issue authorization code to public POST request without local approval", async () => {
    const res = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Forwarded-For": "203.0.113.50", // simulated public internet request
      },
      body: new URLSearchParams({
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        action: "approve",
      }),
      redirect: "manual",
    });

    const location = res.headers.get("location") || "";
    // On unpatched code, public POST directly receives 302 with ?code=oa_code_...
    // Security requirement: MUST NOT directly issue code to public request without local approval!
    expect(location).not.toContain("code=oa_code_");
  });

  // 6. Local loopback with lm_ token CAN approve a pending OAuth authorization request
  it("allows desktop loopback with lm_ token to approve pending OAuth authorization request", async () => {
    // 1. Submit public authorization request
    const postRes = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "X-Forwarded-For": "203.0.113.50",
      },
      body: new URLSearchParams({
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        action: "approve",
        code_challenge: testChallenge,
        code_challenge_method: "S256",
      }),
      redirect: "manual",
    });

    const pendingData = await postRes.json() as any;
    expect(pendingData.status).toBe("pending");
    expect(pendingData.requestId).toMatch(/^oauth_req_/);

    // 2. Desktop approves via loopback with lm_ token
    const resolveRes = await fetch(`${BRIDGE_URL}/oauth/requests/${pendingData.requestId}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer lm_test_management_secret_1234567890",
      },
      body: JSON.stringify({ action: "approve" }),
    });

    expect(resolveRes.status).toBe(200);
    const resolveData = await resolveRes.json() as any;
    expect(resolveData.approved).toBe(true);
    expect(resolveData.code).toMatch(/^oa_code_/);
  });
});
