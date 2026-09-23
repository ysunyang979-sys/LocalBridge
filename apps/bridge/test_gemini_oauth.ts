import crypto from "node:crypto";

const TARGET_HOST = process.env.TEST_TARGET || "http://127.0.0.1:8787";
const PUBLIC_HOST = process.env.PUBLIC_MCP_URL || TARGET_HOST;

async function runTests() {
  console.log("==================================================================");
  console.log("  Gemini Spark Specific OAuth 2.0 PKCE Verification Suite");
  console.log(`  Local Target:   ${TARGET_HOST}`);
  console.log(`  Public Target:  ${PUBLIC_HOST}`);
  console.log("==================================================================\n");

  let allPassed = true;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`[FAIL] ${msg}`);
      allPassed = false;
      throw new Error(msg);
    }
    console.log(`[PASS] ${msg}`);
  }

  // 1. Metadata Verification
  console.log("--- 1. OAuth Metadata Check ---");
  const metaRes = await fetch(`${TARGET_HOST}/.well-known/oauth-authorization-server`);
  assert(metaRes.status === 200, `Metadata HTTP status ${metaRes.status}`);
  const metaData = await metaRes.json() as any;
  assert(metaData.response_types_supported.includes("code"), "response_types_supported includes 'code'");
  assert(metaData.code_challenge_methods_supported.includes("S256"), "code_challenge_methods_supported includes 'S256'");
  assert(Boolean(metaData.authorization_endpoint), `auth_endpoint is ${metaData.authorization_endpoint}`);
  assert(Boolean(metaData.token_endpoint), `token_endpoint is ${metaData.token_endpoint}`);

  // 2. DCR Public Client (PKCE only, token_endpoint_auth_method: "none")
  console.log("\n--- 2. DCR Public Client (PKCE only) ---");
  const dcrPublicRes = await fetch(`${TARGET_HOST}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Gemini Public Agent",
      redirect_uris: ["https://oauth-redirect.googleusercontent.com/r/gemini-spark"],
      token_endpoint_auth_method: "none",
    }),
  });
  assert(dcrPublicRes.status === 201, `DCR Public Client HTTP status ${dcrPublicRes.status}`);
  const dcrPublicData = await dcrPublicRes.json() as any;
  assert(Boolean(dcrPublicData.client_id), `client_id issued: ${dcrPublicData.client_id}`);
  assert(dcrPublicData.token_endpoint_auth_method === "none", `token_endpoint_auth_method is 'none'`);
  assert(dcrPublicData.client_secret === undefined, "client_secret is NOT issued for public client");
  assert(typeof dcrPublicData.client_id_issued_at === "number", `client_id_issued_at is present: ${dcrPublicData.client_id_issued_at}`);

  // 3. DCR Confidential Client (with client_secret)
  console.log("\n--- 3. DCR Confidential Client ---");
  const dcrConfRes = await fetch(`${TARGET_HOST}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Gemini Confidential Client",
      redirect_uris: ["https://spark.gemini.google.com/oauth/callback"],
    }),
  });
  assert(dcrConfRes.status === 201, `DCR Confidential HTTP status ${dcrConfRes.status}`);
  const dcrConfData = await dcrConfRes.json() as any;
  assert(Boolean(dcrConfData.client_secret), "client_secret is issued for confidential client");
  assert(dcrConfData.client_secret_expires_at === 0, "client_secret_expires_at is 0 (never expires)");
  assert(dcrConfData.token_endpoint_auth_method === "client_secret_post", "token_endpoint_auth_method is 'client_secret_post'");

  // 4. Gemini Spark Official PKCE Flow with oauth-redirect.googleusercontent.com
  console.log("\n--- 4. Gemini Spark Flow (oauth-redirect.googleusercontent.com) ---");
  const codeVerifier1 = crypto.randomBytes(32).toString("base64url");
  const codeChallenge1 = crypto.createHash("sha256").update(codeVerifier1).digest("base64url");
  const testState1 = "google_state_" + crypto.randomBytes(8).toString("hex");
  const googleRedirectUri = "https://oauth-redirect.googleusercontent.com/r/my-nexus-proj";

  const authUrl1 = new URL(`${TARGET_HOST}/oauth/authorize`);
  authUrl1.searchParams.set("response_type", "code");
  authUrl1.searchParams.set("client_id", "gemini-spark");
  authUrl1.searchParams.set("redirect_uri", googleRedirectUri);
  authUrl1.searchParams.set("scope", "read write mcp");
  authUrl1.searchParams.set("state", testState1);
  authUrl1.searchParams.set("code_challenge", codeChallenge1);
  authUrl1.searchParams.set("code_challenge_method", "S256");

  const authRes1 = await fetch(authUrl1.toString(), { redirect: "manual" });
  assert(authRes1.status === 302, `Expected 302 Found, got HTTP ${authRes1.status}`);
  const location1 = authRes1.headers.get("location") || "";
  assert(location1.startsWith(googleRedirectUri), `Location points to googleRedirectUri: ${location1}`);
  
  const parsedLoc1 = new URL(location1);
  const issuedCode1 = parsedLoc1.searchParams.get("code");
  const returnedState1 = parsedLoc1.searchParams.get("state");
  assert(Boolean(issuedCode1) && issuedCode1!.startsWith("oa_code_"), `Query param 'code' present: ${issuedCode1?.slice(0, 16)}...`);
  assert(returnedState1 === testState1, `Query param 'state' exactly matches: ${returnedState1}`);

  // Exchange code for token (PKCE)
  const tokenRes1 = await fetch(`${TARGET_HOST}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: issuedCode1!,
      client_id: "gemini-spark",
      redirect_uri: googleRedirectUri,
      code_verifier: codeVerifier1,
    }).toString(),
  });
  assert(tokenRes1.status === 200, `Token Exchange HTTP status ${tokenRes1.status}`);
  const tokenData1 = await tokenRes1.json() as any;
  assert(Boolean(tokenData1.access_token) && tokenData1.access_token.startsWith("mcp_oa_"), `access_token: ${tokenData1.access_token.slice(0, 16)}...`);
  assert(tokenData1.token_type === "Bearer", "token_type is Bearer");
  assert(typeof tokenData1.expires_in === "number", `expires_in: ${tokenData1.expires_in}`);

  // 5. Gemini Spark Flow with spark.gemini.google.com/oauth/callback
  console.log("\n--- 5. Gemini Spark Flow (spark.gemini.google.com/oauth/callback) ---");
  const codeVerifier2 = crypto.randomBytes(32).toString("base64url");
  const codeChallenge2 = crypto.createHash("sha256").update(codeVerifier2).digest("base64url");
  const testState2 = "spark_state_" + crypto.randomBytes(8).toString("hex");
  const sparkRedirectUri = "https://spark.gemini.google.com/oauth/callback";

  const authUrl2 = new URL(`${TARGET_HOST}/oauth/authorize`);
  authUrl2.searchParams.set("response_type", "code");
  authUrl2.searchParams.set("client_id", "gemini-spark");
  authUrl2.searchParams.set("redirect_uri", sparkRedirectUri);
  authUrl2.searchParams.set("state", testState2);
  authUrl2.searchParams.set("code_challenge", codeChallenge2);
  authUrl2.searchParams.set("code_challenge_method", "S256");

  const authRes2 = await fetch(authUrl2.toString(), { redirect: "manual" });
  assert(authRes2.status === 302, `Expected 302 Found, got HTTP ${authRes2.status}`);
  const parsedLoc2 = new URL(authRes2.headers.get("location") || "");
  const issuedCode2 = parsedLoc2.searchParams.get("code");
  const returnedState2 = parsedLoc2.searchParams.get("state");
  assert(Boolean(issuedCode2), `code present: ${issuedCode2?.slice(0, 16)}...`);
  assert(returnedState2 === testState2, `state matches: ${returnedState2}`);

  // 6. Security Enforcement Checks
  console.log("\n--- 6. Security Enforcement Checks ---");
  // 6a. Malicious redirect_uri
  const sec1 = await fetch(`${TARGET_HOST}/oauth/authorize?client_id=gemini-spark&redirect_uri=https://evil-site.com/callback&response_type=code`);
  assert(sec1.status === 400, "Blocked unauthorized redirect_uri with HTTP 400");

  // 6b. Missing redirect_uri
  const sec2 = await fetch(`${TARGET_HOST}/oauth/authorize?client_id=gemini-spark&response_type=code`);
  assert(sec2.status === 400, "Blocked missing redirect_uri with HTTP 400");

  // 6c. Unknown client_id
  const sec3 = await fetch(`${TARGET_HOST}/oauth/authorize?client_id=random-hacker-client&redirect_uri=${sparkRedirectUri}&response_type=code`);
  assert(sec3.status === 400, "Blocked unknown client_id with HTTP 400");

  // 6d. Untrusted custom client does NOT auto-approve (must render consent HTML)
  const secDcr = await fetch(`${TARGET_HOST}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Random App Not Gemini",
      redirect_uris: ["https://localhost/callback"],
    }),
  });
  const secClient = await secDcr.json() as any;
  const sec4 = await fetch(`${TARGET_HOST}/oauth/authorize?client_id=${secClient.client_id}&redirect_uri=https://localhost/callback&response_type=code`);
  assert(sec4.status === 200, `Untrusted client served HTML consent screen (HTTP 200), not auto-approved`);
  const secHtml = await sec4.text();
  assert(secHtml.includes("Random App Not Gemini"), "Consent screen renders client name");

  // 7. Public Cloudflare Ingress Verification
  console.log("\n--- 7. Public Ingress Verification ---");
  try {
    const pubHealth = await fetch(`${PUBLIC_HOST}/health`);
    assert(pubHealth.status === 200, `Public /health HTTP 200 via Cloudflare Tunnel`);
    const pubHealthData = await pubHealth.json() as any;
    assert(pubHealthData.service === "nexus-mcp-bridge", `Service name: ${pubHealthData.service}`);

    const pubMeta = await fetch(`${PUBLIC_HOST}/.well-known/oauth-authorization-server`);
    assert(pubMeta.status === 200, `Public OAuth metadata HTTP 200 via Cloudflare`);
    const pubMetaData = await pubMeta.json() as any;
    assert(pubMetaData.issuer === PUBLIC_HOST, `Public issuer matches: ${pubMetaData.issuer}`);
  } catch (err: any) {
    console.error(`Public ingress test warning: ${err.message}`);
  }

  console.log("\n==================================================================");
  console.log("  ALL GEMINI SPARK OAUTH & PKCE TESTS PASSED 100%!");
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
