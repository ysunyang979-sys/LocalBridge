import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return base64UrlEncode(hash);
}

describe("Standard MCP OAuth 2.0 PKCE Flow Suite", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-oauth-test-"));
    dbFilePath = path.join(tmpDir, "oauth-test.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    await serverInstance.app.listen({ port: 0, host: "127.0.0.1" });
    const port = (serverInstance.app.server.address() as any).port;
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    try {
      await serverInstance.app.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("oauth-discovery: exposes RFC 9207 protected resource metadata", async () => {
    const res = await fetch(`${serverUrl}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.resource).toBe(`${serverUrl}/mcp`);
    expect(data.authorization_servers).toContain(serverUrl);
    expect(data.scopes_supported).toEqual(["read", "write", "execute"]);
  });

  it("oauth-discovery: exposes RFC 8414 authorization server metadata", async () => {
    const res = await fetch(`${serverUrl}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.issuer).toBe(serverUrl);
    expect(data.authorization_endpoint).toBe(`${serverUrl}/oauth/authorize`);
    expect(data.token_endpoint).toBe(`${serverUrl}/oauth/token`);
    expect(data.code_challenge_methods_supported).toContain("S256");
  });

  it("oauth-authorize: renders human consent HTML page", async () => {
    const res = await fetch(
      `${serverUrl}/oauth/authorize?client_id=conn_kimi_web&redirect_uri=https://kimi.moonshot.cn/oauth/callback&state=xyz123`
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Nexus 授权请求");
    expect(html).toContain("Kimi Web");
    expect(html).toContain("读取权限 (Read)");
    expect(html).toContain("写入权限 (Write)");
  });

  it("oauth-redirect-uri: rejects unauthorized redirect URIs", async () => {
    const res = await fetch(
      `${serverUrl}/oauth/authorize?client_id=conn_kimi_web&redirect_uri=https://evil-attacker.com/callback`
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("oauth-pkce: complete end-to-end authorization code grant with S256 PKCE", async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = "state_kimi_987";
    const redirectUri = "https://kimi.moonshot.cn/oauth/callback";

    // 1. User approves on consent screen
    const approveRes = await fetch(`${serverUrl}/oauth/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "manual",
      body: JSON.stringify({
        client_id: "conn_kimi_web",
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        scope: ["read", "write"],
        action: "allow",
      }),
    });

    expect(approveRes.status).toBe(302);
    const location = approveRes.headers.get("location");
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location!);
    expect(redirectUrl.searchParams.get("state")).toBe(state);
    const authCode = redirectUrl.searchParams.get("code");
    expect(authCode).toBeTruthy();

    // 2. Exchange authorization code with wrong code_verifier -> MUST fail
    const badTokenRes = await fetch(`${serverUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: "conn_kimi_web",
        code: authCode,
        code_verifier: "wrong_verifier_12345678901234567890123456789012",
        redirect_uri: redirectUri,
      }),
    });
    expect(badTokenRes.status).toBe(400);

    // 3. Exchange authorization code with correct code_verifier -> MUST succeed
    const tokenRes = await fetch(`${serverUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: "conn_kimi_web",
        code: authCode,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      }),
    });
    expect(tokenRes.status).toBe(200);
    const tokenData = await tokenRes.json();
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.token_type).toBe("Bearer");
    expect(tokenData.refresh_token).toBeTruthy();
    expect(tokenData.scope).toContain("read");
    expect(tokenData.scope).toContain("write");
    expect(tokenData.scope).not.toContain("execute");

    // 4. Replay attack: trying to exchange the same authorization code again MUST fail
    const replayRes = await fetch(`${serverUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: "conn_kimi_web",
        code: authCode,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      }),
    });
    expect(replayRes.status).toBe(400);

    // 5. Refresh token grant
    const refreshRes = await fetch(`${serverUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: tokenData.refresh_token,
      }),
    });
    expect(refreshRes.status).toBe(200);
    const refreshedData = await refreshRes.json();
    expect(refreshedData.access_token).toBeTruthy();
    expect(refreshedData.refresh_token).toBeTruthy();
    expect(refreshedData.refresh_token).not.toBe(tokenData.refresh_token);

    // 6. Revocation
    const revokeRes = await fetch(`${serverUrl}/oauth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: refreshedData.access_token }),
    });
    expect(revokeRes.status).toBe(200);
    const validated = serverInstance.tokenService.validateMcpToken(refreshedData.access_token);
    expect(validated.valid).toBe(false);
  });
});
