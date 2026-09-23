/**
 * Comprehensive verification suite for Nexus Integrated MCP Gateway (:8787)
 */
import { format } from "node:util";

const GATEWAY_URL = process.env.NEXUS_GATEWAY_URL || "http://127.0.0.1:8787";
const CORE_URL = process.env.NEXUS_CORE_URL || "http://127.0.0.1:18080";
const BRIDGE_TOKEN = process.env.NEXUS_BRIDGE_TOKEN || "gemini-spark-nexus-secure-token-2026";

interface TestResult {
  id: string;
  name: string;
  category: "PROTOCOL" | "TOOLS" | "SECURITY" | "LIFECYCLE";
  passed: boolean;
  details: string;
  latencyMs?: number;
}

const results: TestResult[] = [];

async function runTest(
  id: string,
  name: string,
  category: "PROTOCOL" | "TOOLS" | "SECURITY" | "LIFECYCLE",
  fn: () => Promise<{ passed: boolean; details: string }>
) {
  const start = Date.now();
  try {
    const res = await fn();
    const duration = Date.now() - start;
    results.push({
      id,
      name,
      category,
      passed: res.passed,
      details: res.details,
      latencyMs: duration,
    });
    console.log(
      `[${res.passed ? "PASS" : "FAIL"}] [${category}] ${id} - ${name} (${duration}ms): ${res.details}`
    );
  } catch (err: any) {
    const duration = Date.now() - start;
    results.push({
      id,
      name,
      category,
      passed: false,
      details: `Exception: ${err.message}`,
      latencyMs: duration,
    });
    console.log(`[FAIL] [${category}] ${id} - ${name} (${duration}ms): ${err.message}`);
  }
}

async function postMcp(body: any, token: string | null = BRIDGE_TOKEN): Promise<{ status: number; data: any; headers: Headers }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${GATEWAY_URL}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {}

  return { status: res.status, data, headers: res.headers };
}

async function main() {
  console.log("==================================================================");
  console.log("  Nexus LocalBridge Integrated MCP Gateway Verification Suite     ");
  console.log("==================================================================");
  console.log(`  Gateway Endpoint: ${GATEWAY_URL}/mcp`);
  console.log(`  Nexus Core:       ${CORE_URL}`);
  console.log(`  Auth Token:       ${BRIDGE_TOKEN ? "[CONFIGURED]" : "[NONE]"}`);
  console.log("==================================================================\n");

  // 1. Health Check (Nexus Core 18080)
  await runTest("CORE-01", "Nexus Core Server /health check", "LIFECYCLE", async () => {
    const res = await fetch(`${CORE_URL}/health`);
    if (!res.ok) return { passed: false, details: `HTTP ${res.status}` };
    const data = (await res.json()) as any;
    return {
      passed: data.status === "ok" || res.status === 200,
      details: `Core online, response: ${JSON.stringify(data)}`,
    };
  });

  // 2. Health Check (Gateway 8787)
  await runTest("GW-01", "Integrated Gateway /health check", "PROTOCOL", async () => {
    const res = await fetch(`${GATEWAY_URL}/health`);
    if (!res.ok) return { passed: false, details: `HTTP ${res.status}` };
    const data = (await res.json()) as any;
    return {
      passed: data.ok === true && data.nexus?.connected === true,
      details: `Gateway online, Nexus connected: ${data.nexus?.connected}, projects: ${data.nexus?.projectsCount}`,
    };
  });

  // 3. MCP Protocol Initialize (2024-11-05)
  await runTest("MCP-01", "MCP Initialize Handshake (2024-11-05)", "PROTOCOL", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "gemini-spark-test", version: "1.0.0" },
      },
    });

    if (res.status !== 200) return { passed: false, details: `HTTP ${res.status}` };
    const result = res.data?.result;
    const version = result?.protocolVersion;
    const name = result?.serverInfo?.name;

    return {
      passed: res.status === 200 && version === "2024-11-05",
      details: `Negotiated protocol: ${version}, server: ${name}`,
    };
  });

  // 4. MCP Initialized Notification
  await runTest("MCP-02", "MCP Initialized Notification", "PROTOCOL", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    return {
      passed: res.status === 200 || res.status === 204,
      details: `Notification accepted with status ${res.status}`,
    };
  });

  // 5. Tools List & Strict 8 Whitelist
  let whitelistedTools: string[] = [];
  await runTest("TOOL-01", "Strict 8 Whitelisted Tools Discovery", "TOOLS", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    if (res.status !== 200) return { passed: false, details: `HTTP ${res.status}` };
    const tools: Array<{ name: string; description: string }> = res.data?.result?.tools || [];
    whitelistedTools = tools.map((t) => t.name);

    const expectedTools = [
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
    const allExpectedPresent = expectedTools.every((t) => whitelistedTools.includes(t));
    const noForbiddenShell = !whitelistedTools.some(
      (t) => t.includes("shell") || t.includes("command_run") || t.includes("bash")
    );

    return {
      passed: countMatches && allExpectedPresent && noForbiddenShell,
      details: `Exposed tools (${tools.length}/8): [${whitelistedTools.join(", ")}]`,
    };
  });

  // 6. Tool Call: nexus_project_list
  let sampleProjectId = "";
  await runTest("TOOL-02", "Tool Call: nexus_project_list", "TOOLS", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "nexus_project_list",
        arguments: {},
      },
    });

    if (res.status !== 200) return { passed: false, details: `HTTP ${res.status}` };
    const text = res.data?.result?.content?.[0]?.text || "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {}

    const count = parsed?.total ?? 0;
    if (parsed?.projects?.[0]) {
      sampleProjectId = parsed.projects[0].name || parsed.projects[0].projectId;
    }

    return {
      passed: res.status === 200 && count > 0,
      details: `Retrieved ${count} authorized projects (e.g. "${sampleProjectId}")`,
    };
  });

  // 7. Tool Call: nexus_project_info
  await runTest("TOOL-03", "Tool Call: nexus_project_info", "TOOLS", async () => {
    const target = sampleProjectId || "Myweb";
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "nexus_project_info",
        arguments: { projectId: target },
      },
    });

    return {
      passed: res.status === 200 && !res.data?.result?.isError,
      details: `Project info resolved for target "${target}"`,
    };
  });

  // 8. Tool Call: nexus_directory_list
  await runTest("TOOL-04", "Tool Call: nexus_directory_list", "TOOLS", async () => {
    const target = sampleProjectId || "Myweb";
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "nexus_directory_list",
        arguments: { projectId: target, path: "." },
      },
    });

    return {
      passed: res.status === 200 && !res.data?.result?.isError,
      details: `Directory list retrieved for "${target}"`,
    };
  });

  // 9. Tool Call: nexus_git_status
  await runTest("TOOL-05", "Tool Call: nexus_git_status", "TOOLS", async () => {
    const target = sampleProjectId || "Myweb";
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "nexus_git_status",
        arguments: { projectId: target },
      },
    });

    return {
      passed: res.status === 200 && !res.data?.result?.isError,
      details: `Git status retrieved for "${target}"`,
    };
  });

  // 10. Security: 401 Missing Authorization
  await runTest("SEC-01", "Security: Reject missing Authorization header", "SECURITY", async () => {
    const res = await postMcp(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/list",
        params: {},
      },
      null
    );

    return {
      passed: res.status === 401,
      details: `HTTP ${res.status} (Expected 401 Unauthorized)`,
    };
  });

  // 11. Security: 401 Invalid Token
  await runTest("SEC-02", "Security: Reject invalid Bearer token", "SECURITY", async () => {
    const res = await postMcp(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/list",
        params: {},
      },
      "invalid-attacker-token-12345"
    );

    return {
      passed: res.status === 401,
      details: `HTTP ${res.status} (Expected 401 Unauthorized)`,
    };
  });

  // 12. Security: Path Traversal Protection
  await runTest("SEC-03", "Security: Block path traversal attempt (../)", "SECURITY", async () => {
    const target = sampleProjectId || "Myweb";
    const res = await postMcp({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "nexus_file_read",
        arguments: { projectId: target, path: "../../../Windows/System32/drivers/etc/hosts" },
      },
    });

    const isError = res.data?.result?.isError === true;
    const text = res.data?.result?.content?.[0]?.text || "";
    const blocked = isError || text.includes("traversal") || text.includes("Security Error") || text.includes("Access denied");

    return {
      passed: blocked,
      details: `Path traversal safely blocked: ${text.slice(0, 80)}`,
    };
  });

  console.log("\n==================================================================");
  console.log("  Summary of Results                                             ");
  console.log("==================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`  Passed: ${passedCount}/${totalCount} (${Math.round((passedCount / totalCount) * 100)}%)`);

  if (passedCount === totalCount) {
    console.log("  ALL TESTS PASSED! Integrated MCP Gateway is fully operational.\n");
    process.exit(0);
  } else {
    console.log("  SOME TESTS FAILED! Please inspect test details above.\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
