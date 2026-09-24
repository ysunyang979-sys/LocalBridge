import http from "node:http";
import crypto from "node:crypto";

export interface OAuthClient {
  client_id: string;
  client_secret?: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  createdAt: number;
}

export interface AuthorizationCodeRecord {
  code: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: "S256";
  expiresAt: number;
  used: boolean;
}

export interface OAuthAccessTokenRecord {
  access_token: string;
  token_type: "Bearer";
  client_id: string;
  scope: string;
  createdAt: number;
  expiresAt: number;
  refresh_token?: string;
}

export interface PendingAuthRequest {
  id: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  scope: string;
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  codeChallengeHash: string;
  pairingCode?: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "denied" | "expired";
  code?: string;
  redirectUrl?: string;
  resolvedBy?: string;
}

export const SUPPORTED_SCOPES = [
  "nexus:read",
  "nexus:write",
  "nexus:project",
  "nexus:git",
  "nexus:runtime",
  "read",
  "write",
  "mcp",
] as const;

export const DEFAULT_SCOPES = "nexus:read nexus:write nexus:project nexus:git nexus:runtime";

/**
 * Validates whether a redirect_uri belongs to an allowed authority:
 * - Google / Gemini Spark official domains
 * - Localhost loopback (for local testing/tooling)
 * - Cloudflare Quick Tunnels (*.trycloudflare.com)
 * - Configured production base URL (PUBLIC_BASE_URL)
 */
export function isRedirectUriAllowed(uri: string, customBaseUrl?: string): boolean {
  if (!uri || typeof uri !== "string") return false;
  // Wildcards are strictly forbidden
  if (uri === "*" || uri.includes("*")) return false;

  // Standard OAuth 2.0 Out-of-Band
  if (uri.startsWith("urn:ietf:wg:oauth:2.0:oob")) {
    return true;
  }

  try {
    const parsed = new URL(uri);
    const host = parsed.hostname.toLowerCase();
    const proto = parsed.protocol.toLowerCase();

    // 1. Loopback check (http or https allowed for localhost/127.0.0.1)
    if (host === "localhost" || host === "127.0.0.1") {
      return proto === "http:" || proto === "https:";
    }

    // 2. All external redirects MUST be HTTPS
    if (proto !== "https:") {
      return false;
    }

    // 3. Gemini Spark & Google official OAuth endpoints
    if (
      host === "spark.gemini.google.com" ||
      host === "aistudio.google.com" ||
      host === "accounts.google.com" ||
      host === "oauth-redirect.googleusercontent.com" ||
      host.endsWith(".google.com") ||
      host.endsWith(".googleusercontent.com")
    ) {
      return true;
    }

    // 4. Configured custom domain / base URL
    const envBase = customBaseUrl || process.env.PUBLIC_BASE_URL;
    if (envBase) {
      try {
        const baseParsed = new URL(envBase);
        if (parsed.origin === baseParsed.origin || host === baseParsed.hostname.toLowerCase()) {
          return true;
        }
      } catch {}
    }


    return false;
  } catch {
    return false;
  }
}

export class OAuthStore {
  private clients = new Map<string, OAuthClient>();
  private authCodes = new Map<string, AuthorizationCodeRecord>();
  private accessTokens = new Map<string, OAuthAccessTokenRecord>();
  private refreshTokens = new Map<string, string>(); // refresh_token -> access_token
  private pendingRequests = new Map<string, PendingAuthRequest>();

  constructor() {
    this.clearDynamicClientsAndTokens();
  }

  public clearDynamicClientsAndTokens(): void {
    this.authCodes.clear();
    this.accessTokens.clear();
    this.refreshTokens.clear();
    this.pendingRequests.clear();
    this.clients.clear();

    const defaultUris = [
      "https://spark.gemini.google.com/oauth/callback",
      "https://aistudio.google.com/oauth/callback",
      "https://accounts.google.com/oauth/callback",
      "https://oauth-redirect.googleusercontent.com/r/nexus",
      "http://localhost/callback",
      "https://localhost/callback",
    ];

    if (process.env.PUBLIC_BASE_URL) {
      try {
        const origin = new URL(process.env.PUBLIC_BASE_URL).origin;
        defaultUris.push(`${origin}/oauth/callback`);
      } catch {}
    }

    // Pre-register standard well-known clients
    this.registerClientInternal({
      client_id: "gemini-spark",
      client_name: "Gemini Spark Custom App",
      redirect_uris: defaultUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });

    this.registerClientInternal({
      client_id: "google-gemini",
      client_name: "Google Gemini",
      redirect_uris: defaultUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });

    this.registerClientInternal({
      client_id: "mcp-default-client",
      client_name: "Default MCP Client",
      redirect_uris: defaultUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  }

  private registerClientInternal(client: Omit<OAuthClient, "createdAt">): OAuthClient {
    const full: OAuthClient = {
      ...client,
      createdAt: Date.now(),
    };
    this.clients.set(full.client_id, full);
    return full;
  }

  public cleanupExpiredClients(): void {
    const now = Date.now();
    const defaultIds = new Set(["gemini-spark", "google-gemini", "mcp-default-client"]);
    for (const [clientId, client] of this.clients.entries()) {
      if (defaultIds.has(clientId)) continue;
      if (now - client.createdAt > 24 * 60 * 60 * 1000) {
        this.clients.delete(clientId);
      }
    }

    for (const [code, record] of this.authCodes.entries()) {
      if (now > record.expiresAt || record.used) {
        this.authCodes.delete(code);
      }
    }

    for (const [id, req] of this.pendingRequests.entries()) {
      if (now > req.expiresAt + 60 * 1000) {
        this.pendingRequests.delete(id);
      }
    }
  }

  /**
   * Registers a new OAuth client dynamically (RFC 7591 Dynamic Client Registration).
   * Enforces strict redirect_uri validation against allowed domains and limits total clients.
   */
  public registerClient(params: {
    client_name?: string;
    redirect_uris?: string[];
    grant_types?: string[];
    response_types?: string[];
    token_endpoint_auth_method?: string;
  }): OAuthClient {
    this.cleanupExpiredClients();

    if (this.clients.size >= 100) {
      throw new Error("Maximum registered OAuth clients limit reached (100). Please retry later.");
    }

    const clientName = params.client_name || "Gemini Spark / MCP Client";
    const redirectUris: string[] = [];

    if (params.redirect_uris && params.redirect_uris.length > 0) {
      for (const uri of params.redirect_uris) {
        if (!isRedirectUriAllowed(uri)) {
          throw new Error(
            `Forbidden redirect_uri: '${uri}'. Must be Gemini/Google domain, configured host, or localhost.`
          );
        }
        redirectUris.push(uri);
      }
    } else {
      redirectUris.push(
        "https://spark.gemini.google.com/oauth/callback",
        "https://aistudio.google.com/oauth/callback",
        "https://oauth-redirect.googleusercontent.com/r/nexus",
        "http://localhost/callback"
      );
    }

    const isPublicClient = params.token_endpoint_auth_method === "none";
    const clientId = `client_${crypto.randomBytes(16).toString("hex")}`;
    const clientSecret = isPublicClient ? undefined : `secret_${crypto.randomBytes(24).toString("hex")}`;
    const client: OAuthClient = {
      client_id: clientId,
      client_secret: clientSecret,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: params.grant_types || ["authorization_code", "refresh_token"],
      response_types: params.response_types || ["code"],
      createdAt: Date.now(),
    };
    this.clients.set(clientId, client);
    return client;
  }

  public getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Creates a pending authorization request requiring local desktop approval.
   */
  public createPendingAuthRequest(params: {
    client_id: string;
    redirect_uri: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: "S256" | "plain";
  }): PendingAuthRequest {
    const client = this.clients.get(params.client_id);
    if (!client) {
      throw new Error(`Unknown client_id: '${params.client_id}'`);
    }

    if (!isRedirectUriAllowed(params.redirect_uri)) {
      throw new Error(`Unauthorized redirect_uri: '${params.redirect_uri}'`);
    }

    if (!client.redirect_uris.includes(params.redirect_uri)) {
      throw new Error(
        `redirect_uri '${params.redirect_uri}' is not registered for client '${params.client_id}'`
      );
    }

    if (!params.code_challenge) {
      throw new Error("Missing required 'code_challenge' parameter (PKCE is mandatory)");
    }

    if (!params.code_challenge_method || params.code_challenge_method !== "S256") {
      throw new Error("Invalid 'code_challenge_method'. Only 'S256' is supported.");
    }

    const id = `oauth_req_${crypto.randomBytes(16).toString("hex")}`;
    const codeChallenge = params.code_challenge;
    const codeChallengeHash = crypto.createHash("sha256").update(codeChallenge).digest("hex");

    const req: PendingAuthRequest = {
      id,
      clientId: params.client_id,
      clientName: client.client_name,
      redirectUri: params.redirect_uri,
      scope: params.scope || DEFAULT_SCOPES,
      state: params.state,
      codeChallenge,
      codeChallengeMethod: "S256",
      codeChallengeHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes expiry
      status: "pending",
    };

    this.pendingRequests.set(id, req);
    return req;
  }

  public getPendingAuthRequest(id: string): PendingAuthRequest | undefined {
    const req = this.pendingRequests.get(id);
    if (!req) return undefined;
    if (req.status === "pending" && Date.now() > req.expiresAt) {
      req.status = "expired";
    }
    return req;
  }

  public resolvePendingAuthRequest(
    id: string,
    action: "approve" | "deny",
    resolvedBy = "local-desktop"
  ): { success: boolean; error?: string; code?: string; redirectUrl?: string } {
    const req = this.getPendingAuthRequest(id);
    if (!req) {
      return { success: false, error: "Pending authorization request not found" };
    }

    if (req.status !== "pending") {
      return { success: false, error: `Request is already ${req.status}` };
    }

    if (Date.now() > req.expiresAt) {
      req.status = "expired";
      return { success: false, error: "Authorization request has expired" };
    }

    req.resolvedBy = resolvedBy;

    if (action === "deny") {
      req.status = "denied";
      const targetUrl = new URL(req.redirectUri);
      targetUrl.searchParams.set("error", "access_denied");
      targetUrl.searchParams.set("error_description", "User denied authorization request");
      if (req.state) targetUrl.searchParams.set("state", req.state);
      req.redirectUrl = targetUrl.toString();
      return { success: true, redirectUrl: req.redirectUrl };
    }

    try {
      const code = this.createAuthorizationCode({
        client_id: req.clientId,
        redirect_uri: req.redirectUri,
        scope: req.scope,
        state: req.state,
        code_challenge: req.codeChallenge,
        code_challenge_method: req.codeChallengeMethod,
      });

      req.status = "approved";
      req.code = code;

      const targetUrl = new URL(req.redirectUri);
      targetUrl.searchParams.set("code", code);
      if (req.state) targetUrl.searchParams.set("state", req.state);
      req.redirectUrl = targetUrl.toString();

      return { success: true, code, redirectUrl: req.redirectUrl };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Generates and stores a short-lived authorization code (valid for 5 minutes).
   * Validates client and registered redirect_uri strictly.
   */
  public createAuthorizationCode(params: {
    client_id: string;
    redirect_uri: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: "S256" | "plain" | string;
  }): string {
    if (!isRedirectUriAllowed(params.redirect_uri)) {
      throw new Error(`Unauthorized redirect_uri: '${params.redirect_uri}'`);
    }

    const client = this.clients.get(params.client_id);
    if (!client) {
      throw new Error(`Unknown client_id: '${params.client_id}'`);
    }

    if (!client.redirect_uris.includes(params.redirect_uri)) {
      throw new Error(
        `redirect_uri '${params.redirect_uri}' is not registered for client '${params.client_id}'`
      );
    }

    if (!params.code_challenge) {
      throw new Error("Missing required 'code_challenge' parameter (PKCE is mandatory)");
    }

    if (!params.code_challenge_method || params.code_challenge_method !== "S256") {
      throw new Error("Invalid 'code_challenge_method'. Only 'S256' is supported.");
    }

    const code = `oa_code_${crypto.randomBytes(24).toString("hex")}`;
    const record: AuthorizationCodeRecord = {
      code,
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      scope: params.scope || DEFAULT_SCOPES,
      state: params.state,
      code_challenge: params.code_challenge,
      code_challenge_method: "S256",
      expiresAt: Date.now() + 5 * 60 * 1000,
      used: false,
    };
    this.authCodes.set(code, record);
    return code;
  }

  /**
   * Exchanges an authorization code for an Access Token and Refresh Token (RFC 6749 + PKCE RFC 7636).
   */
  public exchangeCode(params: {
    code: string;
    client_id?: string;
    redirect_uri?: string;
    code_verifier?: string;
  }): {
    success: boolean;
    error?: string;
    tokenResponse?: {
      access_token: string;
      token_type: "Bearer";
      expires_in: number;
      refresh_token: string;
      scope: string;
    };
  } {
    const record = this.authCodes.get(params.code);
    if (!record) {
      return { success: false, error: "Invalid authorization code" };
    }

    if (record.used) {
      return { success: false, error: "Authorization code has already been used" };
    }

    if (Date.now() > record.expiresAt) {
      this.authCodes.delete(params.code);
      return { success: false, error: "Authorization code has expired" };
    }

    // Strict redirect_uri verification: if record had redirect_uri, token exchange MUST provide it
    if (record.redirect_uri) {
      if (!params.redirect_uri) {
        return { success: false, error: "Missing required 'redirect_uri' parameter in token exchange" };
      }
      try {
        const recUrl = new URL(record.redirect_uri);
        const reqUrl = new URL(params.redirect_uri);
        if (recUrl.origin !== reqUrl.origin || recUrl.pathname !== reqUrl.pathname) {
          return { success: false, error: "redirect_uri mismatch with authorization request" };
        }
      } catch {
        return { success: false, error: "Malformed redirect_uri parameter" };
      }
    }

    // Strict PKCE enforcement (RFC 7636)
    if (!record.code_challenge) {
      return { success: false, error: "Authorization code lacks PKCE challenge" };
    }

    if (!params.code_verifier) {
      return { success: false, error: "Missing required 'code_verifier' parameter for PKCE" };
    }

    const RFC7636_VERIFIER_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/;
    if (!RFC7636_VERIFIER_REGEX.test(params.code_verifier)) {
      return {
        success: false,
        error: "Invalid 'code_verifier': must be 43-128 unreserved characters ([A-Za-z0-9-._~]) per RFC 7636",
      };
    }

    if (record.code_challenge_method !== "S256") {
      return { success: false, error: "Unsupported code_challenge_method. Only S256 is supported" };
    }

    const hash = crypto.createHash("sha256").update(params.code_verifier).digest("base64url");
    const hashBuf = Buffer.from(hash);
    const challengeBuf = Buffer.from(record.code_challenge);
    if (hashBuf.length !== challengeBuf.length || !crypto.timingSafeEqual(hashBuf, challengeBuf)) {
      return { success: false, error: "PKCE verification failed: S256 challenge mismatch" };
    }

    // Mark code as used immediately
    record.used = true;

    // Issue Access Token & Refresh Token
    const accessToken = `mcp_oa_${crypto.randomBytes(32).toString("hex")}`;
    const refreshToken = `mcp_rt_${crypto.randomBytes(32).toString("hex")}`;
    const expiresInSeconds = 86400; // 24 hours

    const tokenRecord: OAuthAccessTokenRecord = {
      access_token: accessToken,
      token_type: "Bearer",
      client_id: record.client_id,
      scope: record.scope,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresInSeconds * 1000,
      refresh_token: refreshToken,
    };

    this.accessTokens.set(accessToken, tokenRecord);
    this.refreshTokens.set(refreshToken, accessToken);

    return {
      success: true,
      tokenResponse: {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: expiresInSeconds,
        refresh_token: refreshToken,
        scope: record.scope,
      },
    };
  }

  /**
   * Refreshes an expired or existing Access Token using a Refresh Token.
   */
  public refreshAccessToken(refreshToken: string): {
    success: boolean;
    error?: string;
    tokenResponse?: {
      access_token: string;
      token_type: "Bearer";
      expires_in: number;
      refresh_token: string;
      scope: string;
    };
  } {
    const oldAccessToken = this.refreshTokens.get(refreshToken);
    if (!oldAccessToken) {
      return { success: false, error: "Invalid refresh token" };
    }

    const oldRecord = this.accessTokens.get(oldAccessToken);
    if (!oldRecord) {
      return { success: false, error: "Associated token record not found" };
    }

    // Issue new tokens
    const newAccessToken = `mcp_oa_${crypto.randomBytes(32).toString("hex")}`;
    const newRefreshToken = `mcp_rt_${crypto.randomBytes(32).toString("hex")}`;
    const expiresInSeconds = 86400;

    // Invalidate old tokens
    this.accessTokens.delete(oldAccessToken);
    this.refreshTokens.delete(refreshToken);

    const newRecord: OAuthAccessTokenRecord = {
      access_token: newAccessToken,
      token_type: "Bearer",
      client_id: oldRecord.client_id,
      scope: oldRecord.scope,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresInSeconds * 1000,
      refresh_token: newRefreshToken,
    };

    this.accessTokens.set(newAccessToken, newRecord);
    this.refreshTokens.set(newRefreshToken, newAccessToken);

    return {
      success: true,
      tokenResponse: {
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: expiresInSeconds,
        refresh_token: newRefreshToken,
        scope: oldRecord.scope,
      },
    };
  }

  /**
   * Validates an incoming OAuth Access Token.
   */
  public validateAccessToken(token: string): { valid: boolean; record?: OAuthAccessTokenRecord } {
    if (!token || !token.startsWith("mcp_oa_")) {
      return { valid: false };
    }

    const record = this.accessTokens.get(token);
    if (!record) {
      return { valid: false };
    }

    if (Date.now() > record.expiresAt) {
      this.accessTokens.delete(token);
      return { valid: false };
    }

    return { valid: true, record };
  }
}

/**
 * Safe Host Header Allowlist to prevent Host Header Injection.
 */
export function isAllowedHost(hostWithOptionalPort: string): boolean {
  if (!hostWithOptionalPort) return false;
  const host = hostWithOptionalPort.split(":")[0].toLowerCase().trim();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.endsWith(".trycloudflare.com")) return true;
  if (process.env.PUBLIC_BASE_URL) {
    try {
      const parsed = new URL(process.env.PUBLIC_BASE_URL);
      if (host === parsed.hostname.toLowerCase()) return true;
    } catch {}
  }
  if (process.env.ALLOWED_HOSTS) {
    const list = process.env.ALLOWED_HOSTS.split(",").map((h) => h.trim().toLowerCase());
    if (list.includes(host)) return true;
  }
  return false;
}

/**
 * Derives the canonical Public Base URL for OAuth discovery and redirects.
 * Respects PUBLIC_BASE_URL environment variable or proxy headers with strict host validation.
 * NEVER returns or synthesizes fake domains (*.nexus.localbridge.dev).
 */
export function resolveBaseUrl(req: http.IncomingMessage): string {
  if (process.env.PUBLIC_BASE_URL) {
    const configured = process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
    if (configured) return configured;
  }

  const rawForwardedHost = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim();
  const rawHost = rawForwardedHost || req.headers.host || "";
  const rawProto = ((req.headers["x-forwarded-proto"] as string) || "https").split(",")[0].trim().toLowerCase();

  if (rawHost && isAllowedHost(rawHost)) {
    const isLocal = rawHost.startsWith("127.0.0.1") || rawHost.startsWith("localhost");
    const effectiveProto = isLocal ? "http" : rawProto === "http" && !isLocal ? "https" : rawProto;
    return `${effectiveProto}://${rawHost}`.replace(/\/+$/, "");
  }

  return "http://127.0.0.1:8787";
}

/**
 * Builds the standard WWW-Authenticate header with RFC 9728 OAuth resource metadata link.
 */
export function buildWwwAuthenticateHeader(baseUrl: string, error?: string): string {
  const metadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
  if (error) {
    return `Bearer realm="Nexus-MCP-Bridge", error="${error}", error_description="Authentication required", resource_metadata="${metadataUrl}"`;
  }
  return `Bearer realm="Nexus-MCP-Bridge", resource_metadata="${metadataUrl}"`;
}

/**
 * Renders the HTML consent page for Gemini Spark.
 */
export function renderOAuthConsentHtml(params: {
  baseUrl: string;
  clientName: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  nonce?: string;
}): string {
  const {
    baseUrl,
    clientName,
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod,
    nonce,
  } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus MCP Bridge - Authorization</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --card-border: #334155;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --success: #10b981;
      --danger: #ef4444;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .container {
      max-width: 480px;
      width: 90%;
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    .logo-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 20px;
      color: white;
    }
    .logo-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .prompt {
      font-size: 16px;
      line-height: 1.5;
      color: #e2e8f0;
      margin-bottom: 20px;
    }
    .prompt strong {
      color: #818cf8;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(99, 102, 241, 0.15);
      color: #a5b4fc;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .tool-list {
      background: #0f172a;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .tool-list-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 10px;
    }
    .tool-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #cbd5e1;
      margin-bottom: 6px;
    }
    .tool-item:last-child {
      margin-bottom: 0;
    }
    .tool-check {
      color: var(--success);
      font-weight: bold;
    }
    .security-note {
      font-size: 12px;
      color: var(--text-muted);
      background: rgba(16, 185, 129, 0.1);
      border-left: 3px solid var(--success);
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 24px;
    }
    .actions {
      display: flex;
      gap: 12px;
    }
    button {
      flex: 1;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-approve {
      background: var(--primary);
      color: white;
    }
    .btn-approve:hover {
      background: var(--primary-hover);
    }
    .btn-deny {
      background: #334155;
      color: #94a3b8;
    }
    .btn-deny:hover {
      background: #475569;
      color: #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <div class="logo-icon">N</div>
      <div class="logo-title">Nexus MCP Bridge</div>
    </div>

    <div class="badge">OAuth 2.0 Authorization Request</div>

    <div class="prompt">
      <strong>${escapeHtml(clientName)}</strong> is requesting authorization:
      <br>
      <span style="color: #60a5fa; font-size: 15px; font-weight: 600; display: block; margin-top: 6px;">
        Allow Gemini to access Nexus MCP tools
      </span>
    </div>

    <div class="tool-list">
      <div class="tool-list-title">Whitelisted Capabilities (8 Tools)</div>
      <div class="tool-item"><span class="tool-check">✓</span> <span>Read & list authorized local projects</span></div>
      <div class="tool-item"><span class="tool-check">✓</span> <span>Browse project file & directory hierarchy</span></div>
      <div class="tool-item"><span class="tool-check">✓</span> <span>Read project source code (strictly sandboxed)</span></div>
      <div class="tool-item"><span class="tool-check">✓</span> <span>Create & edit files inside project boundaries</span></div>
      <div class="tool-item"><span class="tool-check">✓</span> <span>Query Git repository branch and status</span></div>
      <div class="tool-item"><span class="tool-check">✓</span> <span>Query local persistent runtimes</span></div>
    </div>

    <div class="security-note">
      🔒 <strong>Security Policy:</strong> Shell execution, arbitrary commands, and token management are strictly disabled.
    </div>

    <form method="POST" action="${escapeHtml(baseUrl)}/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      <input type="hidden" name="scope" value="${escapeHtml(scope)}">
      <input type="hidden" name="state" value="${escapeHtml(state || "")}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge || "")}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod || "")}">
      <input type="hidden" name="action" value="approve">

      <div class="actions">
        <button type="submit" class="btn-approve">Authorize / 允许授权</button>
        <button type="button" id="btn-deny" class="btn-deny">Deny / 拒绝</button>
      </div>
    </form>
  </div>
  <script nonce="${escapeHtml(nonce || "")}">
    document.getElementById('btn-deny')?.addEventListener('click', () => window.history.back());
  </script>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
