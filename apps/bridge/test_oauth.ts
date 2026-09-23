/**
 * Automated Verification Suite for Nexus MCP Bridge OAuth 2.0 & Streamable HTTP
 */
import crypto from "node:crypto";

const BASE_URL = process.argv[2] || process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
const BRIDGE_TOKEN = process.env.NEXUS_BRIDGE_TOKEN || "gemini-spark-nexus-secure-token-2026";

interface TestResult {
  step: string;
  name: string;
  category: "DISCOVERY" | "REGISTRATION" | "OAUTH_FLOW" | "MCP_STREAMABLE" | "SECURITY";
  passed: boolean;
  details: string;
  latencyMs?: number;
}

const results: TestResult[] = [];

async function testStep(
  step: string,
  name: string,
  category: "DISCOVERY" | "REGISTRATION" | "OAUTH_FLOW" | "MCP_STREAMABLE" | "SECURITY",
  fn: () => Promise<{ passed: boolean; details: string }>
) {
  const start = Date.now();
  try {
    const res = await fn();
    const duration = Date.now() - start;
    results.push({
      step,
      name,
      category,
      passed: res.passed,
      details: res.details,
      latencyMs: duration,
    });
    console.log(`[${res.passed ? "PASS" : "FAIL"}] [${category}] ${step} - ${name} (${duration}ms): ${res.details}`);
  } catch (err: any) {
    const duration = Date.now() - start;
    results.push({
      step,
      name,
      category,
      passed: false,
      details: `Exception: ${err.message}`,
      latencyMs: duration,
    });
    console.log(`[FAIL] [${category}] ${step} - ${name} (${duration}ms): ${err.message}`);
  }
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("  Nexus MCP Bridge OAuth 2.0 & Protocol Verification Suite        ");
  console.log("==================================================================");
  console.log(`  Testing Target:  ${BASE_URL}`);
  console.log("==================================================================\n");

  // 1. Health Check
  await testStep("A0", "Bridge /health endpoint", "DISCOVERY", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const data = (await res.json()) as any;
    return {
      passed: res.status === 200 && data.ok === true && data.auth?.oauth2Enabled === true,
      details: `HTTP ${res.status}, oauth2Enabled=${data.auth?.oauth2Enabled}, nexus=${data.nexus?.connected}`,
    };
  });

  // 2. Protected Resource Metadata (RFC 9728)
  await testStep("A1", "GET /.well-known/oauth-protected-resource", "DISCOVERY", async () => {
    const res = await fetch(`${BASE_URL}/.well-known/oauth-protected-resource`);
    const data = (await res.json()) as any;
    const hasResource = typeof data.resource === "string" && data.resource.includes("/mcp");
    const hasAuthServers = Array.isArray(data.authorization_servers) && data.authorization_servers.length > 0;
    return {
      passed: res.status === 200 && hasResource && hasAuthServers,
      details: `resource=${data.resource}, auth_servers=${JSON.stringify(data.authorization_servers)}`,
    };
  });

  // 3. Authorization Server Metadata (RFC 8414)
  await testStep("A2", "GET /.well-known/oauth-authorization-server", "DISCOVERY", async () => {
    const res = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`);
    const data = (await res.json()) as any;
    const hasAuthEndpoint = typeof data.authorization_endpoint === "string";
    const hasTokenEndpoint = typeof data.token_endpoint === "string";
    const hasS256 = Array.isArray(data.code_challenge_methods_supported) && data.code_challenge_methods_supported.includes("S256");
    return {
      passed: res.status === 200 && hasAuthEndpoint && hasTokenEndpoint && hasS256,
      details: `issuer=${data.issuer}, auth_endpoint=${data.authorization_endpoint}, token_endpoint=${data.token_endpoint}`,
    };
  });

  // 4. OpenID Configuration Alias
  await testStep("A3", "GET /.well-known/openid-configuration", "DISCOVERY", async () => {
    const res = await fetch(`${BASE_URL}/.well-known/openid-configuration`);
    const data = (await res.json()) as any;
    return {
      passed: res.status === 200 && Boolean(data.token_endpoint),
      details: `HTTP ${res.status}, token_endpoint=${data.token_endpoint}`,
    };
  });

  // 5. Dynamic Client Registration (RFC 7591)
  let registeredClientId = "";
  let registeredClientSecret = "";
  await testStep("B1", "Dynamic Client Registration (DCR)", "REGISTRATION", async () => {
    const res = await fetch(`${BASE_URL}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Gemini Spark Test Client",
        redirect_uris: ["https://spark.gemini.google.com/oauth/callback", "https://localhost/callback"],
      }),
    });
    const data = (await res.json()) as any;
    registeredClientId = data.client_id;
    registeredClientSecret = data.client_secret;
    return {
      passed: res.status === 201 && Boolean(data.client_id) && Boolean(data.client_secret),
      details: `client_id=${data.client_id}, client_name=${data.client_name}`,
    };
  });

  // 6. Authorization Consent Screen Rendering (User facing page)
  await testStep("C1", "GET /oauth/authorize (Consent Screen)", "OAUTH_FLOW", async () => {
    const res = await fetch(
      `${BASE_URL}/oauth/authorize?client_id=${registeredClientId}&redirect_uri=https://localhost/callback&response_type=code&state=xyz123`
    );
    const html = await res.text();
    const hasBranding = html.includes("Nexus MCP Bridge");
    const hasPrompt = html.includes("Allow Gemini to access Nexus MCP tools");
    const hasAuthorizeBtn = html.includes("Authorize") || html.includes("允许授权");
    return {
      passed: res.status === 200 && hasBranding && hasPrompt && hasAuthorizeBtn,
      details: `Status ${res.status}, contains branding: ${hasBranding}, contains required prompt: ${hasPrompt}`,
    };
  });

  // 7. PKCE Code Generation (Authorization Code)
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  let authCode = "";

  await testStep("D1", "PKCE Authorization Code Flow (auto_approve)", "OAUTH_FLOW", async () => {
    const target = `${BASE_URL}/oauth/authorize?client_id=${registeredClientId}&redirect_uri=https://localhost/callback&response_type=code&state=teststate123&code_challenge=${codeChallenge}&code_challenge_method=S256&auto_approve=true`;
    const res = await fetch(target, { redirect: "manual" });
    const location = res.headers.get("location") || "";
    const locUrl = new URL(location);
    authCode = locUrl.searchParams.get("code") || "";
    const returnedState = locUrl.searchParams.get("state");

    return {
      passed: res.status === 302 && Boolean(authCode) && returnedState === "teststate123",
      details: `HTTP ${res.status} Redirect, code=${authCode.slice(0, 12)}..., state=${returnedState}`,
    };
  });

  // 8. Token Exchange (Authorization Code + PKCE Verifier)
  let oauthAccessToken = "";
  let oauthRefreshToken = "";

  await testStep("E1", "Token Exchange (/oauth/token)", "OAUTH_FLOW", async () => {
    const res = await fetch(`${BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        client_id: registeredClientId,
        redirect_uri: "https://localhost/callback",
        code_verifier: codeVerifier,
      }).toString(),
    });

    const data = (await res.json()) as any;
    oauthAccessToken = data.access_token;
    oauthRefreshToken = data.refresh_token;

    return {
      passed: res.status === 200 && Boolean(data.access_token) && data.token_type === "Bearer" && Boolean(data.refresh_token),
      details: `HTTP ${res.status}, access_token=${oauthAccessToken.slice(0, 14)}..., expires_in=${data.expires_in}s`,
    };
  });

  // 9. Refresh Token Exchange
  await testStep("E2", "Refresh Token Flow (/oauth/token)", "OAUTH_FLOW", async () => {
    const res = await fetch(`${BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: oauthRefreshToken,
        client_id: registeredClientId,
      }).toString(),
    });

    const data = (await res.json()) as any;
    if (data.access_token) {
      oauthAccessToken = data.access_token; // update with refreshed token
    }

    return {
      passed: res.status === 200 && Boolean(data.access_token) && data.token_type === "Bearer",
      details: `HTTP ${res.status}, refreshed access_token=${data.access_token.slice(0, 14)}...`,
    };
  });

  // 10. WWW-Authenticate Header on 401
  await testStep("SEC1", "WWW-Authenticate RFC 9728 Compliance on 401", "SECURITY", async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    const wwwAuth = res.headers.get("www-authenticate") || "";
    const hasResourceMeta = wwwAuth.includes("resource_metadata=");

    return {
      passed: res.status === 401 && hasResourceMeta,
      details: `HTTP 401, WWW-Authenticate: ${wwwAuth}`,
    };
  });

  // 11. MCP Initialize Handshake via OAuth Access Token
  await testStep("MCP1", "MCP Initialize using OAuth Access Token", "MCP_STREAMABLE", async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oauthAccessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 10,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "gemini-spark-client", version: "1.0.0" },
        },
      }),
    });

    const data = (await res.json()) as any;
    const version = data.result?.protocolVersion;
    const serverName = data.result?.serverInfo?.name;

    return {
      passed: res.status === 200 && version === "2024-11-05" && serverName === "nexus-mcp-bridge",
      details: `Negotiated protocolVersion=${version}, server=${serverName}`,
    };
  });

  // 12. MCP Initialized Notification
  await testStep("MCP2", "MCP Initialized Notification", "MCP_STREAMABLE", async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oauthAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });

    return {
      passed: res.status === 200 || res.status === 202 || res.status === 204,
      details: `HTTP ${res.status}`,
    };
  });

  // 13. MCP Tools List via OAuth Token (Strict 8 Whitelist)
  let whitelistedNames: string[] = [];
  await testStep("MCP3", "MCP Tools List (Strict 8 Whitelist via OAuth)", "MCP_STREAMABLE", async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oauthAccessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/list",
        params: {},
      }),
    });

    const data = (await res.json()) as any;
    const tools = data.result?.tools || [];
    whitelistedNames = tools.map((t: any) => t.name);

    const expected = [
      "nexus_project_list",
      "nexus_project_info",
      "nexus_directory_list",
      "nexus_file_read",
      "nexus_file_create",
      "nexus_file_write",
      "nexus_git_status",
      "nexus_runtime_list",
    ];

    const countMatches = tools.length === 8;
    const allPresent = expected.every((t) => whitelistedNames.includes(t));
    const noShell = !whitelistedNames.some((t) => t.includes("shell") || t.includes("command_run"));

    return {
      passed: res.status === 200 && countMatches && allPresent && noShell,
      details: `Found (${tools.length}/8) tools: [${whitelistedNames.join(", ")}]`,
    };
  });

  // 14. MCP Tool Call: nexus_project_list
  await testStep("MCP4", "MCP Tool Call: nexus_project_list via OAuth", "MCP_STREAMABLE", async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oauthAccessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: {
          name: "nexus_project_list",
          arguments: {},
        },
      }),
    });

    const data = (await res.json()) as any;
    const text = data.result?.content?.[0]?.text || "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {}

    const count = parsed?.total ?? 0;
    const names = (parsed?.projects || []).map((p: any) => p.name).join(", ");

    return {
      passed: res.status === 200 && count > 0 && !data.result?.isError,
      details: `Total ${count} projects found in Nexus: [${names}]`,
    };
  });

  // 15. Legacy Static Bearer Token Compatibility
  await testStep("SEC2", "Legacy Static Bearer Token Compatibility", "SECURITY", async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 13,
        method: "tools/call",
        params: {
          name: "nexus_project_list",
          arguments: {},
        },
      }),
    });

    const data = (await res.json()) as any;
    return {
      passed: res.status === 200 && !data.result?.isError,
      details: `Static Bearer Token accepted seamlessly with status ${res.status}`,
    };
  });

  // 16. Security: DCR Rejects Unauthorized redirect_uri
  await testStep("SEC3", "DCR Rejects Unauthorized redirect_uri", "SECURITY", async () => {
    const res = await fetch(`${BASE_URL}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Evil Client",
        redirect_uris: ["https://evil-attacker.com/callback"],
      }),
    });
    const data = (await res.json()) as any;
    return {
      passed: res.status === 400 && data.error === "invalid_client_metadata",
      details: `HTTP ${res.status}, error=${data.error}, error_description=${data.error_description}`,
    };
  });

  // 17. Security: Authorize Rejects Unauthorized redirect_uri
  await testStep("SEC4", "Authorize Rejects Unauthorized redirect_uri", "SECURITY", async () => {
    const res = await fetch(
      `${BASE_URL}/oauth/authorize?client_id=${registeredClientId}&redirect_uri=https://evil-attacker.com/callback`
    );
    const text = await res.text();
    return {
      passed: res.status === 400 && text.includes("Unauthorized redirect_uri"),
      details: `HTTP ${res.status}, blocked malicious redirect_uri properly`,
    };
  });

  // 18. Security: Authorize Rejects Unknown Client ID
  await testStep("SEC5", "Authorize Rejects Unknown Client ID", "SECURITY", async () => {
    const res = await fetch(
      `${BASE_URL}/oauth/authorize?client_id=totally-fake-client-999&redirect_uri=https://localhost/callback`
    );
    const text = await res.text();
    return {
      passed: res.status === 400 && text.includes("Unknown client_id"),
      details: `HTTP ${res.status}, blocked unvetted client_id`,
    };
  });

  // 19. Security: PKCE Verification Mismatch Rejection
  await testStep("SEC6", "PKCE Rejects Invalid code_verifier", "SECURITY", async () => {
    // Generate a fresh code
    const freshVerifier = crypto.randomBytes(32).toString("base64url");
    const freshChallenge = crypto.createHash("sha256").update(freshVerifier).digest("base64url");
    const target = `${BASE_URL}/oauth/authorize?client_id=${registeredClientId}&redirect_uri=https://localhost/callback&response_type=code&code_challenge=${freshChallenge}&code_challenge_method=S256&auto_approve=true`;
    const resAuth = await fetch(target, { redirect: "manual" });
    const location = resAuth.headers.get("location") || "";
    const locUrl = new URL(location);
    const freshCode = locUrl.searchParams.get("code") || "";

    // Try to exchange with WRONG verifier
    const resToken = await fetch(`${BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: freshCode,
        client_id: registeredClientId,
        redirect_uri: "https://localhost/callback",
        code_verifier: "wrong-verifier-123456789012345678901234567890",
      }).toString(),
    });
    const data = (await resToken.json()) as any;
    return {
      passed: resToken.status === 400 && data.error === "invalid_grant" && data.error_description.includes("PKCE"),
      details: `HTTP ${resToken.status}, error=${data.error}, reason=${data.error_description}`,
    };
  });

  // 20. Security: Single-Use Code Enforcement (Replay Attack Defense)
  await testStep("SEC7", "Single-Use Code Enforcement (Replay Rejection)", "SECURITY", async () => {
    const resToken = await fetch(`${BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode, // already used in E1
        client_id: registeredClientId,
        redirect_uri: "https://localhost/callback",
        code_verifier: codeVerifier,
      }).toString(),
    });
    const data = (await resToken.json()) as any;
    return {
      passed: resToken.status === 400 && data.error === "invalid_grant" && data.error_description.includes("already been used"),
      details: `HTTP ${resToken.status}, replay blocked: ${data.error_description}`,
    };
  });

  console.log("  Test Summary                                                    ");
  console.log("==================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`  Passed: ${passedCount}/${totalCount} (${Math.round((passedCount / totalCount) * 100)}%)`);

  if (passedCount === totalCount) {
    console.log("  ALL TESTS PASSED! OAuth 2.0 & Streamable HTTP 100% Operational.\n");
    process.exit(0);
  } else {
    console.log("  SOME TESTS FAILED! Please inspect test details above.\n");
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
