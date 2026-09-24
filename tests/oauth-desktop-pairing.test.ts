import { describe, it, expect, beforeAll } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import { OAuthStore } from "../apps/bridge/src/oauth.js";

const TEST_PORT = 18790;
const BRIDGE_URL = `http://127.0.0.1:${TEST_PORT}`;
const MGMT_TOKEN = "lm_desktop_pairing_secret_token_123456789";

function rawHttpRequest(
  options: http.RequestOptions,
  bodyData?: string
): Promise<{ statusCode?: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });
    req.on("error", reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

describe("Commit 3: Desktop Management Wiring & 6-Digit Pairing Code", () => {
  const testVerifier = "E9Melhoa2OwvFrGMTJguCH5rtG6j30-CzUMq-3FF8UU_test_pkce";
  const testChallenge = crypto.createHash("sha256").update(testVerifier).digest("base64url");

  beforeAll(async () => {
    process.env.PORT = String(TEST_PORT);
    process.env.NEXUS_BRIDGE_PORT = String(TEST_PORT);
    process.env.LOCALBRIDGE_MANAGEMENT_TOKEN = MGMT_TOKEN;

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

  let ipCounter = 10;
  async function createPublicPendingRequest() {
    const ip = `203.0.113.${ipCounter++}`;
    const postRes = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "X-Forwarded-For": ip,
        "CF-Connecting-IP": ip,
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
    return (await postRes.json()) as any;
  }

  describe("GET /oauth/requests endpoint security & structure", () => {
    it("rejects request without management token (403)", async () => {
      const res = await fetch(`${BRIDGE_URL}/oauth/requests`);
      expect(res.status).toBe(403);
    });

    it("rejects request with invalid management token (403)", async () => {
      const res = await fetch(`${BRIDGE_URL}/oauth/requests`, {
        headers: { Authorization: "Bearer wrong_token" },
      });
      expect(res.status).toBe(403);
    });

    it("rejects request with proxy forwarding headers (403)", async () => {
      const res = await fetch(`${BRIDGE_URL}/oauth/requests`, {
        headers: {
          Authorization: `Bearer ${MGMT_TOKEN}`,
          "X-Forwarded-For": "203.0.113.1",
        },
      });
      expect(res.status).toBe(403);

      const res2 = await fetch(`${BRIDGE_URL}/oauth/requests`, {
        headers: {
          Authorization: `Bearer ${MGMT_TOKEN}`,
          "CF-Connecting-IP": "203.0.113.1",
        },
      });
      expect(res2.status).toBe(403);
    });

    it("rejects request with non-loopback Host header (403)", async () => {
      const res = await rawHttpRequest({
        host: "127.0.0.1",
        port: TEST_PORT,
        path: "/oauth/requests",
        method: "GET",
        headers: {
          Authorization: `Bearer ${MGMT_TOKEN}`,
          Host: "attacker.com",
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("allows valid loopback request and returns pending items with 6-digit pairing code", async () => {
      const created = await createPublicPendingRequest();
      expect(created.requestId).toBeDefined();

      const res = await fetch(`${BRIDGE_URL}/oauth/requests`, {
        headers: {
          Authorization: `Bearer ${MGMT_TOKEN}`,
          Host: `127.0.0.1:${TEST_PORT}`,
        },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      const list = Array.isArray(data) ? data : data.requests;
      expect(Array.isArray(list)).toBe(true);

      const item = list.find((r: any) => r.id === created.requestId);
      expect(item).toBeDefined();
      expect(item.id).toBe(created.requestId);
      expect(item.client_name || item.clientName).toBeDefined();
      // redirect_host should only contain domain, no sensitive path or query
      const host = item.redirect_host || item.redirect_uri_host;
      expect(host).toBe("spark.gemini.google.com");
      expect(host).not.toContain("/oauth/callback");
      // pairing_code MUST NOT be exposed in GET /oauth/requests list
      expect(item.pairing_code).toBeUndefined();
      expect(item.pairingCode).toBeUndefined();
      const serialized = JSON.stringify(data);
      const secretPairingCode = created.pairing_code || created.pairingCode;
      expect(secretPairingCode).toMatch(/^\d{6}$/);
      expect(serialized).not.toContain(secretPairingCode);

      // remaining attempts
      const remaining = item.remaining_attempts ?? item.remainingAttempts;
      expect(remaining).toBe(3);
    });
  });

  describe("202 HTML waiting page renders pairing code", () => {
    it("renders 6-digit pairing code and instructions on 202 page", async () => {
      const res = await fetch(`${BRIDGE_URL}/oauth/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Forwarded-For": "203.0.113.89",
          "CF-Connecting-IP": "203.0.113.89",
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

      expect(res.status).toBe(202);
      const html = await res.text();
      expect(html).toMatch(/\b\d{6}\b/);
      expect(html).toMatch(/配对码|Pairing Code/i);
    });
  });

  describe("POST /oauth/requests/:id/resolve pairing code validation & security", () => {
    it("rejects resolution with proxy forwarding headers (403)", async () => {
      const created = await createPublicPendingRequest();
      const res = await fetch(`${BRIDGE_URL}/oauth/requests/${created.requestId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MGMT_TOKEN}`,
          "X-Forwarded-For": "203.0.113.1",
        },
        body: JSON.stringify({ action: "approve", pairing_code: "123456" }),
      });
      expect(res.status).toBe(403);
    });

    it("rejects resolution with non-loopback Host header (403)", async () => {
      const created = await createPublicPendingRequest();
      const body = JSON.stringify({ action: "approve", pairing_code: "123456" });
      const res = await rawHttpRequest(
        {
          host: "127.0.0.1",
          port: TEST_PORT,
          path: `/oauth/requests/${created.requestId}/resolve`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            Authorization: `Bearer ${MGMT_TOKEN}`,
            Host: "external-domain.com",
          },
        },
        body
      );
      expect(res.statusCode).toBe(403);
    });

    it("rejects approval when pairing code is missing (400)", async () => {
      const created = await createPublicPendingRequest();
      const res = await fetch(`${BRIDGE_URL}/oauth/requests/${created.requestId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MGMT_TOKEN}`,
          Host: `127.0.0.1:${TEST_PORT}`,
        },
        body: JSON.stringify({ action: "approve" }),
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toMatch(/pairing/i);
    });

    it("rejects approval with incorrect pairing code", async () => {
      const created = await createPublicPendingRequest();
      const res = await fetch(`${BRIDGE_URL}/oauth/requests/${created.requestId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MGMT_TOKEN}`,
          Host: `127.0.0.1:${TEST_PORT}`,
        },
        body: JSON.stringify({ action: "approve", pairing_code: "000000" }),
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toMatch(/pairing/i);
    });

    it("locks request to denied after 3 failed pairing code attempts", async () => {
      const created = await createPublicPendingRequest();

      // 3 wrong attempts
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${BRIDGE_URL}/oauth/requests/${created.requestId}/resolve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${MGMT_TOKEN}`,
            Host: `127.0.0.1:${TEST_PORT}`,
          },
          body: JSON.stringify({ action: "approve", pairing_code: `00000${i}` }),
        });
        expect(res.status).toBe(400);
      }

      // Check status is now denied
      const statusRes = await fetch(`${BRIDGE_URL}/oauth/requests/${created.requestId}/status`);
      const statusData = (await statusRes.json()) as any;
      expect(statusData.status).toBe("denied");

      // Even with correct code from waiting page, now denied
      const actualCode = created.pairing_code || created.pairingCode || "999999";

      const res4 = await fetch(`${BRIDGE_URL}/oauth/requests/${created.requestId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MGMT_TOKEN}`,
          Host: `127.0.0.1:${TEST_PORT}`,
        },
        body: JSON.stringify({ action: "approve", pairing_code: actualCode }),
      });
      expect(res4.status).toBe(400);
      const data4 = (await res4.json()) as any;
      expect(data4.error).toMatch(/denied|exceeded/i);
    });

    it("approves with correct pairing code and issues code that can only be exchanged once", async () => {
      const created = await createPublicPendingRequest();
      const actualCode = created.pairing_code || created.pairingCode;

      const resolveRes = await fetch(`${BRIDGE_URL}/oauth/requests/${created.requestId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MGMT_TOKEN}`,
          Host: `127.0.0.1:${TEST_PORT}`,
        },
        body: JSON.stringify({ action: "approve", pairing_code: actualCode }),
      });
      expect(resolveRes.status).toBe(200);
      const resolveData = (await resolveRes.json()) as any;
      expect(resolveData.approved).toBe(true);
      expect(resolveData.code).toMatch(/^oa_code_/);

      // Exchange code first time -> 200
      const ex1 = await fetch(`${BRIDGE_URL}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          code: resolveData.code,
          code_verifier: testVerifier,
        }),
      });
      expect(ex1.status).toBe(200);
      const tokenData = (await ex1.json()) as any;
      expect(tokenData.access_token).toBeDefined();

      // Exchange code second time -> 400 (single-use enforced)
      const ex2 = await fetch(`${BRIDGE_URL}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          code: resolveData.code,
          code_verifier: testVerifier,
        }),
      });
      expect(ex2.status).toBe(400);
      const errData = (await ex2.json()) as any;
      expect(errData.error_description).toMatch(/already been used/i);
    });
  });

  describe("Capacity limits and expiration", () => {
    it("rejects approval for expired request", () => {
      const store = new OAuthStore();
      const req = store.createPendingAuthRequest({
        client_id: "gemini-spark",
        redirect_uri: "https://spark.gemini.google.com/oauth/callback",
        code_challenge: testChallenge,
        code_challenge_method: "S256",
      });

      // Force request into expired state
      req.expiresAt = Date.now() - 1000;

      const res = store.resolvePendingAuthRequest(req.id, "approve", req.pairingCode, "desktop-user");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/expired/i);
    });

    it("enforces maximum pending queue limit (50 requests)", () => {
      const store = new OAuthStore();
      for (let i = 0; i < 50; i++) {
        store.createPendingAuthRequest({
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          code_challenge: testChallenge,
          code_challenge_method: "S256",
        });
      }

      // The 51st request must be rejected
      expect(() => {
        store.createPendingAuthRequest({
          client_id: "gemini-spark",
          redirect_uri: "https://spark.gemini.google.com/oauth/callback",
          code_challenge: testChallenge,
          code_challenge_method: "S256",
        });
      }).toThrow(/limit reached|50/i);
    });
  });
});
