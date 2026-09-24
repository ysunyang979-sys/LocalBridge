import http from "node:http";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { NexusClient } from "./nexus-client.js";
import { handleMcpHttpRequest } from "./server.js";
import { validateRequestAuth, logMcpRequest } from "./security.js";
import {
  OAuthStore,
  resolveBaseUrl,
  buildWwwAuthenticateHeader,
  renderOAuthConsentHtml,
  SUPPORTED_SCOPES,
  DEFAULT_SCOPES,
  isRedirectUriAllowed,
  escapeHtml,
} from "./oauth.js";

dotenv.config();

const HOST = process.env.NEXUS_BRIDGE_HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || process.env.NEXUS_BRIDGE_PORT || "8787", 10);
const BRIDGE_TOKEN = process.env.NEXUS_BRIDGE_TOKEN || "gemini-spark-nexus-secure-token-2026";
const CORE_URL = process.env.NEXUS_CORE_URL || "http://127.0.0.1:18080";

const nexusClient = new NexusClient({
  coreUrl: CORE_URL,
});

const oauthStore = new OAuthStore();
const registrationRateLimits = new Map<string, number[]>();

function sendHtml(res: http.ServerResponse, statusCode: number, html: string, nonce?: string) {
  const actualNonce = nonce || crypto.randomBytes(16).toString("base64");
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${actualNonce}'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  res.end(html);
}

function sendErrorHtml(res: http.ServerResponse, statusCode: number, message: string) {
  const nonce = crypto.randomBytes(16).toString("base64");
  const safeMessage = escapeHtml(message);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OAuth Error</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #ef4444; border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; }
    h3 { margin-top: 0; color: #ef4444; }
    p { color: #94a3b8; line-height: 1.5; word-break: break-word; }
  </style>
</head>
<body>
  <div class="card">
    <h3>OAuth Error</h3>
    <p>${safeMessage}</p>
  </div>
</body>
</html>`;
  sendHtml(res, statusCode, html, nonce);
}

/**
 * Helper to read request body as string.
 */
function readRequestBody(req: http.IncomingMessage, maxBytes = 10 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/**
 * Parses form-urlencoded or JSON body into key-value pairs.
 */
function parseFormOrJsonBody(rawBody: string, contentType = ""): Record<string, any> {
  if (!rawBody.trim()) return {};

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }

  // Default to URL-encoded
  const params = new URLSearchParams(rawBody);
  const out: Record<string, any> = {};
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const baseUrl = resolveBaseUrl(req);
  const url = new URL(req.url || "/", baseUrl);
  const pathname = url.pathname;

  const clientIp =
    (req.headers["cf-connecting-ip"] as string) ||
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    "unknown";
  const userAgent = (req.headers["user-agent"] as string) || "none";
  const authHeader = req.headers["authorization"] ? "[PRESENT]" : "[NONE]";

  console.log(
    `[HTTP IN] ${req.method} ${pathname}${url.search} (IP: ${clientIp}, UA: ${userAgent}, Auth: ${authHeader}, Accept: ${req.headers["accept"] || "*/*"})`
  );

  res.on("finish", () => {
    console.log(
      `[HTTP OUT] ${req.method} ${pathname} -> ${res.statusCode} (${Date.now() - startTime}ms)`
    );
  });

  // Global CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, X-Requested-With, Origin"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "WWW-Authenticate, Link, Mcp-Session-Id, Mcp-Protocol-Version, Content-Type"
  );

  // 1. Handle OPTIONS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1.1 Handle HEAD Probes
  if (req.method === "HEAD" && (pathname === "/mcp" || pathname === "/health" || pathname === "/")) {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Link": `<${baseUrl}/.well-known/oauth-protected-resource>; rel="oauth-protected-resource"`,
    });
    res.end();
    return;
  }

  // 2. GET /health or GET /
  if (req.method === "GET" && (pathname === "/health" || pathname === "/api/health" || pathname === "/")) {
    const nexusHealth = await nexusClient.checkHealth();
    let projectsCount = 0;
    if (nexusHealth.ok) {
      try {
        const projects = await nexusClient.getProjects();
        projectsCount = projects.length;
      } catch {}
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          ok: true,
          service: "nexus-mcp-bridge",
          version: "1.1.0",
          baseUrl,
          nexus: {
            connected: nexusHealth.ok,
            url: CORE_URL,
            projectsCount,
            error: nexusHealth.error,
          },
          auth: {
            bearerEnabled: Boolean(BRIDGE_TOKEN),
            oauth2Enabled: true,
            supportedGrantTypes: ["authorization_code", "refresh_token"],
          },
          endpoints: {
            mcp: `${baseUrl}/mcp`,
            protectedResourceMetadata: `${baseUrl}/.well-known/oauth-protected-resource`,
            authorizationServerMetadata: `${baseUrl}/.well-known/oauth-authorization-server`,
            authorizationEndpoint: `${baseUrl}/oauth/authorize`,
            tokenEndpoint: `${baseUrl}/oauth/token`,
            registrationEndpoint: `${baseUrl}/oauth/register`,
          },
        },
        null,
        2
      )
    );
    return;
  }

  // 3. OAuth 2.0 Protected Resource Metadata (RFC 9728)
  if (
    req.method === "GET" &&
    (pathname === "/.well-known/oauth-protected-resource" ||
      pathname === "/.well-known/oauth-protected-resource/mcp")
  ) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          resource: `${baseUrl}/mcp`,
          authorization_servers: [baseUrl],
          scopes_supported: SUPPORTED_SCOPES,
          bearer_methods_supported: ["header"],
          resource_name: "Nexus MCP Bridge",
          resource_documentation: `${baseUrl}/health`,
        },
        null,
        2
      )
    );
    return;
  }

  // 4. OAuth 2.0 Authorization Server Metadata (RFC 8414 & OIDC Discovery)
  if (
    req.method === "GET" &&
    (pathname === "/.well-known/oauth-authorization-server" ||
      pathname === "/.well-known/openid-configuration")
  ) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          registration_endpoint: `${baseUrl}/oauth/register`,
          jwks_uri: `${baseUrl}/oauth/jwks.json`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
          scopes_supported: SUPPORTED_SCOPES,
        },
        null,
        2
      )
    );
    return;
  }

  // 5. JWKS Endpoint (RFC 7517)
  if (req.method === "GET" && pathname === "/oauth/jwks.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ keys: [] }));
    return;
  }

  // 6. Dynamic Client Registration (RFC 7591)
  if (req.method === "POST" && pathname === "/oauth/register") {
    try {
      const regIp =
        (req.headers["cf-connecting-ip"] as string)?.split(",")[0]?.trim() ||
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown";
      const now = Date.now();
      const timestamps = (registrationRateLimits.get(regIp) || []).filter((t) => now - t < 60000);
      if (timestamps.length >= 10) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "slow_down",
            error_description: "Too many registration requests. Please wait.",
          })
        );
        return;
      }
      timestamps.push(now);
      registrationRateLimits.set(regIp, timestamps);

      const rawBody = await readRequestBody(req, 16 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);

      const authMethod =
        data.token_endpoint_auth_method === "none"
          ? "none"
          : (data.token_endpoint_auth_method || "client_secret_post");

      const client = oauthStore.registerClient({
        client_name: data.client_name,
        redirect_uris: Array.isArray(data.redirect_uris) ? data.redirect_uris : undefined,
        grant_types: Array.isArray(data.grant_types) ? data.grant_types : undefined,
        response_types: Array.isArray(data.response_types) ? data.response_types : undefined,
        token_endpoint_auth_method: authMethod,
      });

      const responsePayload: Record<string, any> = {
        client_id: client.client_id,
        client_id_issued_at: Math.floor(client.createdAt / 1000),
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        grant_types: client.grant_types,
        response_types: client.response_types,
        token_endpoint_auth_method: authMethod,
      };

      if (client.client_secret) {
        responsePayload.client_secret = client.client_secret;
        responsePayload.client_secret_expires_at = 0;
      }

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responsePayload, null, 2));
      return;
    } catch (err: any) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_client_metadata", error_description: err.message }));
      return;
    }
  }

  // 6.1 Check Status of Pending OAuth Request
  if (req.method === "GET" && pathname.startsWith("/oauth/requests/") && pathname.endsWith("/status")) {
    const parts = pathname.split("/");
    const reqId = parts[3];
    const pending = oauthStore.getPendingAuthRequest(reqId);
    if (!pending) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found", message: "Request not found or expired" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: pending.status,
        code: pending.code,
        redirectUrl: pending.redirectUrl,
      })
    );
    return;
  }

  // 6.2 Local Desktop Resolve Pending OAuth Request (requires loopback + lm_ token)
  if (req.method === "POST" && pathname.startsWith("/oauth/requests/") && pathname.endsWith("/resolve")) {
    const remoteAddr = req.socket.remoteAddress || "";
    const isLoopback =
      remoteAddr === "127.0.0.1" ||
      remoteAddr === "::1" ||
      remoteAddr === "::ffff:127.0.0.1";
    const authHeader = req.headers.authorization || "";
    const mgmtToken = process.env.LOCALBRIDGE_MANAGEMENT_TOKEN || process.env.NEXUS_MANAGEMENT_TOKEN;
    const hasForwardingHeader = Boolean(
      req.headers["x-forwarded-for"] ||
      req.headers["cf-connecting-ip"] ||
      req.headers["forwarded"]
    );

    if (!isLoopback || hasForwardingHeader || !mgmtToken || authHeader !== `Bearer ${mgmtToken}`) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "FORBIDDEN",
          message: "Approval resolution requires local management authorization",
        })
      );
      return;
    }

    const parts = pathname.split("/");
    const reqId = parts[3];
    const rawBody = await readRequestBody(req, 4096);
    const body = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const action = body.action === "approve" ? "approve" : "deny";

    const result = oauthStore.resolvePendingAuthRequest(reqId, action, "desktop-admin");
    if (!result.success) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        approved: action === "approve",
        code: result.code,
        redirectUrl: result.redirectUrl,
      })
    );
    return;
  }

  // 7. OAuth 2.0 Authorization Endpoint (RFC 6749)
  if (pathname === "/oauth/authorize") {
    if (req.method === "GET") {
      const clientId = url.searchParams.get("client_id")?.trim() || "";
      const redirectUri = url.searchParams.get("redirect_uri")?.trim() || "";
      const responseType = url.searchParams.get("response_type")?.trim() || "";
      const scope = url.searchParams.get("scope")?.trim() || DEFAULT_SCOPES;
      const state = url.searchParams.get("state")?.trim() || undefined;
      const codeChallenge = url.searchParams.get("code_challenge")?.trim() || undefined;
      const codeChallengeMethod =
        (url.searchParams.get("code_challenge_method")?.trim() as "S256" | "plain") ||
        (codeChallenge ? "S256" : undefined);

      if (!clientId) {
        sendErrorHtml(res, 400, "Missing required 'client_id' parameter");
        return;
      }

      if (!redirectUri) {
        sendErrorHtml(res, 400, "Missing required 'redirect_uri' parameter");
        return;
      }

      if (!isRedirectUriAllowed(redirectUri)) {
        sendErrorHtml(
          res,
          400,
          `Unauthorized redirect_uri '${redirectUri}'. Only Google/Gemini official callbacks, configured production domain, or localhost are permitted.`
        );
        return;
      }

      const client = oauthStore.getClient(clientId);
      if (!client) {
        sendErrorHtml(
          res,
          400,
          `Unknown client_id '${clientId}'. Please register via /oauth/register.`
        );
        return;
      }

      if (!client.redirect_uris.includes(redirectUri)) {
        sendErrorHtml(
          res,
          400,
          `redirect_uri '${redirectUri}' is not registered for client '${clientId}'.`
        );
        return;
      }

      if (responseType && responseType !== "code") {
        const targetUrl = new URL(redirectUri);
        targetUrl.searchParams.set("error", "unsupported_response_type");
        targetUrl.searchParams.set(
          "error_description",
          `Unsupported response_type '${responseType}'. Only 'code' is supported.`
        );
        if (typeof state === "string" && state.length > 0) targetUrl.searchParams.set("state", state);
        res.writeHead(302, { Location: targetUrl.toString() });
        res.end();
        return;
      }

      // Render Authorization Consent Screen
      const clientName = client.client_name || "Gemini Spark";
      const nonce = crypto.randomBytes(16).toString("base64");
      const html = renderOAuthConsentHtml({
        baseUrl,
        clientName,
        clientId,
        redirectUri,
        scope: scope || DEFAULT_SCOPES,
        state,
        codeChallenge,
        codeChallengeMethod,
        nonce,
      });

      sendHtml(res, 200, html, nonce);
      return;
    }

    if (req.method === "POST") {
      const rawBody = await readRequestBody(req, 16 * 1024);
      const body = parseFormOrJsonBody(rawBody, req.headers["content-type"]);

      const clientId = body.client_id;
      const redirectUri = body.redirect_uri;
      const scope = body.scope || DEFAULT_SCOPES;
      const state = body.state;
      const codeChallenge = body.code_challenge;
      const codeChallengeMethod = body.code_challenge_method as "S256" | "plain";
      const action = body.action;

      // 1. action missing or not "approve" is strictly treated as DENIED
      if (!action || action !== "approve") {
        if (redirectUri && isRedirectUriAllowed(redirectUri)) {
          const targetUrl = new URL(redirectUri);
          targetUrl.searchParams.set("error", "access_denied");
          targetUrl.searchParams.set("error_description", "User denied authorization request");
          if (typeof state === "string" && state.length > 0) targetUrl.searchParams.set("state", state);
          res.writeHead(302, { Location: targetUrl.toString() });
          res.end();
          return;
        }
        sendErrorHtml(res, 400, "Authorization denied");
        return;
      }

      // 2. client_id must be provided and registered
      if (!clientId) {
        sendErrorHtml(res, 400, "Missing required 'client_id'");
        return;
      }

      const client = oauthStore.getClient(clientId);
      if (!client) {
        sendErrorHtml(res, 400, `Unknown client_id '${clientId}'`);
        return;
      }

      // 3. redirect_uri must be provided and registered for this client
      if (!redirectUri) {
        sendErrorHtml(res, 400, "Missing required 'redirect_uri'");
        return;
      }

      if (!isRedirectUriAllowed(redirectUri)) {
        sendErrorHtml(res, 400, `Unauthorized redirect_uri '${redirectUri}'`);
        return;
      }

      if (!client.redirect_uris.includes(redirectUri)) {
        sendErrorHtml(
          res,
          400,
          `redirect_uri '${redirectUri}' is not registered for client '${clientId}'`
        );
        return;
      }

      // 4. Authorization must bind to local user: check if local desktop admin
      const remoteAddr = req.socket.remoteAddress || "";
      const isLoopback =
        remoteAddr === "127.0.0.1" ||
        remoteAddr === "::1" ||
        remoteAddr === "::ffff:127.0.0.1";
      const authHeader = req.headers.authorization || "";
      const mgmtToken = process.env.LOCALBRIDGE_MANAGEMENT_TOKEN || process.env.NEXUS_MANAGEMENT_TOKEN;
      const hasForwardingHeader = Boolean(
        req.headers["x-forwarded-for"] ||
        req.headers["cf-connecting-ip"] ||
        req.headers["forwarded"]
      );
      const isLocalAdmin = isLoopback && !hasForwardingHeader && Boolean(mgmtToken) && authHeader === `Bearer ${mgmtToken}`;

      if (isLocalAdmin) {
        // Direct issuance allowed only for authenticated local desktop administrator
        try {
          const code = oauthStore.createAuthorizationCode({
            client_id: clientId,
            redirect_uri: redirectUri,
            scope,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
          });

          const targetUrl = new URL(redirectUri);
          targetUrl.searchParams.set("code", code);
          if (typeof state === "string" && state.length > 0) targetUrl.searchParams.set("state", state);

          res.writeHead(302, { Location: targetUrl.toString() });
          res.end();
          return;
        } catch (err: any) {
          sendErrorHtml(res, 400, err.message);
          return;
        }
      }

      // Public request: MUST NOT directly issue code! Create pending authorization request
      try {
        const pending = oauthStore.createPendingAuthRequest({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
        });

        const acceptsJson = (req.headers.accept || "").includes("application/json");
        if (acceptsJson) {
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "pending",
              requestId: pending.id,
              clientName: client.client_name,
              message: "Authorization request pending. Requires local approval in Nexus Desktop.",
              checkUrl: `${baseUrl}/oauth/requests/${pending.id}/status`,
            })
          );
          return;
        }

        // HTML response for browser form submission
        const nonce = crypto.randomBytes(16).toString("base64");
        const waitHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Approval Required - Nexus Desktop</title>
  <meta http-equiv="refresh" content="3">
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; }
    h2 { margin-top: 0; color: #a5b4fc; }
    p { color: #94a3b8; line-height: 1.5; }
    .spinner { display: inline-block; width: 36px; height: 36px; border: 4px solid #334155; border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Awaiting Local Approval</h2>
    <p>Client <strong>${escapeHtml(client.client_name)}</strong> has requested access to Nexus.</p>
    <p>Please open <strong>Nexus Desktop</strong> to approve this connection.</p>
  </div>
  <script nonce="${nonce}">
    setInterval(async () => {
      try {
        const res = await fetch('/oauth/requests/${pending.id}/status');
        const data = await res.json();
        if (data.status === 'approved' && data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else if (data.status === 'denied' || data.status === 'expired') {
          window.location.reload();
        }
      } catch {}
    }, 2000);
  </script>
</body>
</html>`;
        sendHtml(res, 202, waitHtml, nonce);
        return;
      } catch (err: any) {
        sendErrorHtml(res, 400, err.message);
        return;
      }
    }
  }

  // 8. OAuth 2.0 Token Endpoint (RFC 6749)
  if (pathname === "/oauth/token") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_request", error_description: "POST required" }));
      return;
    }

    try {
      const rawBody = await readRequestBody(req);
      const body = parseFormOrJsonBody(rawBody, req.headers["content-type"]);

      // Extract client credentials from Basic Auth if present
      let clientId = body.client_id;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.toLowerCase().startsWith("basic ")) {
        try {
          const creds = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
          const [id] = creds.split(":");
          if (id) clientId = id;
        } catch {}
      }

      const grantType = body.grant_type;

      if (grantType === "authorization_code") {
        const code = body.code;
        const redirectUri = body.redirect_uri;
        const codeVerifier = body.code_verifier;

        if (!code) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_request",
              error_description: "Missing required parameter 'code'",
            })
          );
          return;
        }

        const exchange = oauthStore.exchangeCode({
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        });

        if (!exchange.success || !exchange.tokenResponse) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_grant",
              error_description: exchange.error || "Token exchange failed",
            })
          );
          return;
        }

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        });
        res.end(JSON.stringify(exchange.tokenResponse));
        return;
      }

      if (grantType === "refresh_token") {
        const refreshToken = body.refresh_token;
        if (!refreshToken) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_request",
              error_description: "Missing required parameter 'refresh_token'",
            })
          );
          return;
        }

        const refreshed = oauthStore.refreshAccessToken(refreshToken);
        if (!refreshed.success || !refreshed.tokenResponse) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_grant",
              error_description: refreshed.error || "Refresh token invalid or expired",
            })
          );
          return;
        }

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        });
        res.end(JSON.stringify(refreshed.tokenResponse));
        return;
      }

      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "unsupported_grant_type",
          error_description: `Grant type '${grantType}' is not supported. Use 'authorization_code' or 'refresh_token'.`,
        })
      );
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "server_error", error_description: err.message }));
      return;
    }
  }

  // 9. GET /mcp or GET /mcp/health (Status & Probe / SSE handshake)
  if (req.method === "GET" && (pathname === "/mcp" || pathname === "/mcp/health")) {
    if (req.headers.accept?.includes("text/event-stream")) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`event: endpoint\ndata: ${baseUrl}/mcp\n\n`);
      return;
    }

    res.setHeader("Link", `<${baseUrl}/.well-known/oauth-protected-resource>; rel="oauth-protected-resource"`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          ok: true,
          service: "nexus-mcp-bridge",
          endpoint: "POST /mcp",
          protocol: "MCP Streamable HTTP / JSON-RPC 2.0",
          defaultProtocolVersion: "2024-11-05",
          toolsAvailable: 8,
          authRequired: true,
          oauthMetadata: `${baseUrl}/.well-known/oauth-protected-resource`,
        },
        null,
        2
      )
    );
    return;
  }

  // 10. POST /mcp (Standard MCP Endpoint)
  if (pathname === "/mcp") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32601, message: "Method Not Allowed: MCP requires HTTP POST" },
          id: null,
        })
      );
      return;
    }

    // 10.1 Dual Authentication: Static Bearer Token OR OAuth 2.0 Access Token
    const authCheck = validateRequestAuth(req.headers.authorization, BRIDGE_TOKEN, oauthStore);
    if (!authCheck.valid) {
      const isMissingAuth = !req.headers.authorization;
      const wwwAuth = isMissingAuth
        ? buildWwwAuthenticateHeader(baseUrl)
        : buildWwwAuthenticateHeader(baseUrl, "invalid_token");
      res.setHeader("WWW-Authenticate", wwwAuth);
      res.setHeader("Link", `<${baseUrl}/.well-known/oauth-protected-resource>; rel="oauth-protected-resource"`);
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: `Unauthorized: ${authCheck.error}. Please authenticate via OAuth 2.0 or supply Bearer token.`,
            data: {
              resource_metadata: `${baseUrl}/.well-known/oauth-protected-resource`,
              authorization_server: `${baseUrl}/.well-known/oauth-authorization-server`,
            },
          },
          id: null,
        })
      );
      logMcpRequest({
        method: "POST",
        ip: req.socket.remoteAddress,
        durationMs: Date.now() - startTime,
        success: false,
        error: authCheck.error,
      });
      return;
    }

    // 10.2 Read JSON-RPC request body
    let bodyStr = "";
    try {
      bodyStr = await readRequestBody(req);
    } catch (err: any) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Request body exceeds maximum size" },
          id: null,
        })
      );
      return;
    }

    let parsedBody: any;
    try {
      parsedBody = bodyStr.trim() ? JSON.parse(bodyStr) : undefined;
    } catch (err: any) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: `Parse error: Invalid JSON (${err.message})` },
          id: null,
        })
      );
      logMcpRequest({
        method: "POST",
        ip: req.socket.remoteAddress,
        durationMs: Date.now() - startTime,
        success: false,
        error: "Invalid JSON",
      });
      return;
    }

    // 10.3 Dispatch to Stateless MCP Server & Streamable HTTP Transport
    try {
      await handleMcpHttpRequest(req, res, parsedBody, nexusClient);
      const isToolCall = parsedBody?.method === "tools/call";
      const toolName = isToolCall ? parsedBody?.params?.name : undefined;

      logMcpRequest({
        method: parsedBody?.method || "unknown",
        tool: toolName,
        ip: req.socket.remoteAddress,
        durationMs: Date.now() - startTime,
        success: true,
      });
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: `Internal server error: ${err.message}` },
            id: parsedBody?.id ?? null,
          })
        );
      }
      logMcpRequest({
        method: parsedBody?.method || "unknown",
        ip: req.socket.remoteAddress,
        durationMs: Date.now() - startTime,
        success: false,
        error: err.message,
      });
    }
    return;
  }

  // 11. Fallback 404 for Unknown Endpoints
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not Found",
      message: "Nexus MCP Bridge with OAuth 2.0. Use POST /mcp or GET /health.",
      discovery: {
        oauthProtectedResource: `${baseUrl}/.well-known/oauth-protected-resource`,
        oauthAuthorizationServer: `${baseUrl}/.well-known/oauth-authorization-server`,
      },
    })
  );
});

server.listen(PORT, HOST, () => {
  console.log("==================================================");
  console.log("  Nexus MCP Bridge (Gemini Spark + OAuth 2.0)     ");
  console.log("==================================================");
  console.log(`  Local Endpoint:       http://${HOST}:${PORT}/mcp`);
  console.log(`  Health Check:         http://${HOST}:${PORT}/health`);
  console.log(`  Protected Resource:   http://${HOST}:${PORT}/.well-known/oauth-protected-resource`);
  console.log(`  Authorization Server: http://${HOST}:${PORT}/.well-known/oauth-authorization-server`);
  console.log(`  Downstream Nexus:     ${CORE_URL}`);
  console.log(`  Bearer Token Auth:    [ENABLED]`);
  console.log(`  OAuth 2.0 Auth:       [ENABLED]`);
  console.log("==================================================");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Nexus MCP Bridge] Shutting down gracefully...");
  server.close(() => {
    console.log("[Nexus MCP Bridge] Server stopped.");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n[Nexus MCP Bridge] Shutting down gracefully...");
  server.close(() => {
    console.log("[Nexus MCP Bridge] Server stopped.");
    process.exit(0);
  });
});
