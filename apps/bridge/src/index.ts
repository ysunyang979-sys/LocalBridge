import http from "node:http";
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
      const rawBody = await readRequestBody(req);
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
      const prompt = url.searchParams.get("prompt")?.trim();
      const autoApproveParam = url.searchParams.get("auto_approve") === "true";

      if (!clientId) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h3>OAuth Error: Missing required 'client_id' parameter</h3>");
        return;
      }

      if (!redirectUri) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h3>OAuth Error: Missing required 'redirect_uri' parameter</h3>");
        return;
      }

      if (!isRedirectUriAllowed(redirectUri)) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<h3>OAuth Error: Unauthorized redirect_uri '${redirectUri}'. Only Google/Gemini official callbacks, configured production domain, or localhost are permitted.</h3>`
        );
        return;
      }

      const client = oauthStore.getClient(clientId);
      if (!client) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h3>OAuth Error: Unknown client_id '${clientId}'. Please register via /oauth/register.</h3>`);
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

      // Check whether to auto-approve:
      // 1. Explicit auto_approve=true parameter (for tests/internal API)
      // 2. prompt=none (RFC 6749 / OIDC standard silent flow)
      // 3. Trusted Gemini/Google client with an official Google/Gemini redirect URI
      let shouldAutoApprove = autoApproveParam;

      if (prompt === "none") {
        shouldAutoApprove = true;
      }

      const isGoogleHost = (() => {
        try {
          const h = new URL(redirectUri).hostname.toLowerCase();
          return (
            h === "spark.gemini.google.com" ||
            h === "aistudio.google.com" ||
            h === "accounts.google.com" ||
            h === "oauth-redirect.googleusercontent.com" ||
            h.endsWith(".google.com") ||
            h.endsWith(".googleusercontent.com")
          );
        } catch {
          return false;
        }
      })();

      const isTrustedGemini =
        (clientId === "gemini-spark" ||
          clientId === "google-gemini" ||
          (client.client_name && client.client_name.toLowerCase().includes("gemini")) ||
          (client.client_name && client.client_name.toLowerCase().includes("google"))) &&
        isRedirectUriAllowed(redirectUri) &&
        isGoogleHost;

      if (isTrustedGemini) {
        shouldAutoApprove = true;
      }

      if (shouldAutoApprove) {
        try {
          const code = oauthStore.createAuthorizationCode({
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: scope || DEFAULT_SCOPES,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
          });

          const targetUrl = new URL(redirectUri);
          targetUrl.searchParams.set("code", code);
          if (typeof state === "string" && state.length > 0) {
            targetUrl.searchParams.set("state", state);
          }

          res.writeHead(302, { Location: targetUrl.toString() });
          res.end();
          return;
        } catch (err: any) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h3>OAuth Error: ${err.message}</h3>`);
          return;
        }
      }

      // Render Authorization Consent Screen
      const clientName = client.client_name || "Gemini Spark";
      const html = renderOAuthConsentHtml({
        baseUrl,
        clientName,
        clientId,
        redirectUri,
        scope: scope || DEFAULT_SCOPES,
        state,
        codeChallenge,
        codeChallengeMethod,
      });

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "POST") {
      const rawBody = await readRequestBody(req);
      const body = parseFormOrJsonBody(rawBody, req.headers["content-type"]);

      const clientId = body.client_id || "gemini-spark";
      const redirectUri = body.redirect_uri;
      const scope = body.scope || DEFAULT_SCOPES;
      const state = body.state;
      const codeChallenge = body.code_challenge;
      const codeChallengeMethod = body.code_challenge_method as "S256" | "plain";
      const action = body.action || "approve";

      if (!redirectUri) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h3>OAuth Error: Missing required 'redirect_uri'</h3>");
        return;
      }

      if (!isRedirectUriAllowed(redirectUri)) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h3>OAuth Error: Unauthorized redirect_uri '${redirectUri}'</h3>`);
        return;
      }

      const client = oauthStore.getClient(clientId);
      if (!client) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h3>OAuth Error: Unknown client_id '${clientId}'</h3>`);
        return;
      }

      const targetUrl = new URL(redirectUri);
      if (action !== "approve") {
        targetUrl.searchParams.set("error", "access_denied");
        targetUrl.searchParams.set("error_description", "User denied authorization request");
        if (typeof state === "string" && state.length > 0) targetUrl.searchParams.set("state", state);
        res.writeHead(302, { Location: targetUrl.toString() });
        res.end();
        return;
      }

      try {
        const code = oauthStore.createAuthorizationCode({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
        });

        targetUrl.searchParams.set("code", code);
        if (typeof state === "string" && state.length > 0) targetUrl.searchParams.set("state", state);

        res.writeHead(302, { Location: targetUrl.toString() });
        res.end();
        return;
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h3>OAuth Error: ${err.message}</h3>`);
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
