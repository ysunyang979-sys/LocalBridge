import { describe, it, expect, beforeAll } from "vitest";
import { generatePkcePair } from "../apps/bridge/src/oauth.js";

const TEST_PORT = 18788;
const BRIDGE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe("Commit 1: OAuth Page XSS Defense & Security Response Headers", () => {
  const { challenge } = generatePkcePair();
  let ipSeq = 1;

  beforeAll(async () => {
    process.env.PORT = String(TEST_PORT);
    process.env.NEXUS_BRIDGE_PORT = String(TEST_PORT);
    process.env.LOCALBRIDGE_MANAGEMENT_TOKEN = "lm_test_management_secret_1234567890";

    // Dynamic import will start server on TEST_PORT if not already started
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

  const xssPayloads = [
    "<script>alert(1)</script>",
    "' onmouseover=",
  ];

  function assertSecurityHeaders(headers: Headers) {
    const csp = headers.get("content-security-policy") || "";
    const xcto = headers.get("x-content-type-options");
    const rp = headers.get("referrer-policy");
    const xfo = headers.get("x-frame-options");

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(xcto).toBe("nosniff");
    expect(rp).toBe("no-referrer");
    expect(xfo).toBe("DENY");
  }

  describe("GET /oauth/authorize XSS Prevention & Headers", () => {
    for (const payload of xssPayloads) {
      it(`escapes XSS payload in client_id (error page 400): ${payload}`, async () => {
        const ip = `203.0.113.${ipSeq++}`;
        const res = await fetch(
          `${BRIDGE_URL}/oauth/authorize?client_id=${encodeURIComponent(payload)}&redirect_uri=https://spark.gemini.google.com/oauth/callback&response_type=code&code_challenge=${challenge}&code_challenge_method=S256`,
          {
            headers: { "X-Forwarded-For": ip, "CF-Connecting-IP": ip },
            redirect: "manual",
          }
        );
        expect(res.status).toBe(400);
        const text = await res.text();
        assertSecurityHeaders(res.headers);
        expect(text).not.toContain("<script>alert(1)</script>");
        expect(text).not.toContain("' onmouseover=");
      });

      it(`escapes XSS payload in redirect_uri (error page 400): ${payload}`, async () => {
        const ip = `203.0.113.${ipSeq++}`;
        const res = await fetch(
          `${BRIDGE_URL}/oauth/authorize?client_id=gemini-spark&redirect_uri=${encodeURIComponent(payload)}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256`,
          {
            headers: { "X-Forwarded-For": ip, "CF-Connecting-IP": ip },
            redirect: "manual",
          }
        );
        expect(res.status).toBe(400);
        const text = await res.text();
        assertSecurityHeaders(res.headers);
        expect(text).not.toContain("<script>alert(1)</script>");
        expect(text).not.toContain("' onmouseover=");
      });

      it(`escapes XSS payload in state (consent page 200): ${payload}`, async () => {
        const ip = `203.0.113.${ipSeq++}`;
        const res = await fetch(
          `${BRIDGE_URL}/oauth/authorize?client_id=gemini-spark&redirect_uri=https://spark.gemini.google.com/oauth/callback&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=${encodeURIComponent(
            payload
          )}`,
          {
            headers: { "X-Forwarded-For": ip, "CF-Connecting-IP": ip },
            redirect: "manual",
          }
        );
        expect(res.status).toBe(200);
        const text = await res.text();
        assertSecurityHeaders(res.headers);
        expect(text).not.toContain("<script>alert(1)</script>");
        expect(text).not.toContain("' onmouseover=");
      });

      it(`escapes XSS payload in scope (consent page 200): ${payload}`, async () => {
        const ip = `203.0.113.${ipSeq++}`;
        const res = await fetch(
          `${BRIDGE_URL}/oauth/authorize?client_id=gemini-spark&redirect_uri=https://spark.gemini.google.com/oauth/callback&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&scope=${encodeURIComponent(
            payload
          )}`,
          {
            headers: { "X-Forwarded-For": ip, "CF-Connecting-IP": ip },
            redirect: "manual",
          }
        );
        expect(res.status).toBe(200);
        const text = await res.text();
        assertSecurityHeaders(res.headers);
        expect(text).not.toContain("<script>alert(1)</script>");
        expect(text).not.toContain("' onmouseover=");
      });
    }
  });

  describe("Waiting page (202) security response headers", () => {
    it("asserts strict security headers on 202 waiting page", async () => {
      const ip = `203.0.113.${ipSeq++}`;
      const res = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/html",
          "X-Forwarded-For": ip,
          "CF-Connecting-IP": ip,
        },
        body: new URLSearchParams({
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          action: "approve",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }).toString(),
        redirect: "manual",
      });

      expect(res.status).toBe(202);
      assertSecurityHeaders(res.headers);
      const html = await res.text();
      expect(html).toContain("Awaiting Local Approval");
      expect(html).toContain("配对码 / Pairing Code");
    });
  });

  describe("POST /oauth/authorize XSS Prevention & Headers", () => {
    const postFields = [
      "client_id",
      "redirect_uri",
      "state",
      "scope",
      "code_challenge",
      "code_challenge_method",
      "action",
    ];

    for (const field of postFields) {
      for (const payload of xssPayloads) {
        it(`escapes XSS payload in POST field ${field}: ${payload}`, async () => {
          const bodyParams: Record<string, string> = {
            client_id: "gemini-spark",
            redirect_uri: "https://spark.gemini.google.com/oauth/callback",
            action: "approve",
            scope: "openid",
            state: "test-state",
            code_challenge: challenge,
            code_challenge_method: "S256",
          };

          bodyParams[field] = payload;
          const ip = `203.0.113.${ipSeq++}`;

          const res = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "text/html",
              "X-Forwarded-For": ip,
              "CF-Connecting-IP": ip,
            },
            body: new URLSearchParams(bodyParams).toString(),
            redirect: "manual",
          });

          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("text/html")) {
            const text = await res.text();
            assertSecurityHeaders(res.headers);
            expect(text).not.toContain("<script>alert(1)</script>");
            expect(text).not.toContain("' onmouseover=");
          }
        });
      }
    }
  });
});
