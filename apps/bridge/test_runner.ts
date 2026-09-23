import dotenv from "dotenv";

dotenv.config();

const BRIDGE_URL = "http://127.0.0.1:8787";
const VALID_TOKEN = process.env.NEXUS_BRIDGE_TOKEN || "gemini-spark-nexus-secure-token-2026";
const INVALID_TOKEN = "wrong-token-12345";

interface TestResult {
  step: string;
  name: string;
  httpStatus: number;
  expectedStatus: number;
  protocolVersion?: string;
  request: any;
  response: any;
  success: boolean;
  notes?: string;
}

const results: TestResult[] = [];

async function runStep(
  step: string,
  name: string,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: any,
  expectedStatus: number,
  validator: (status: number, data: any) => { success: boolean; notes?: string }
) {
  console.log(`\n==================================================`);
  console.log(`[TEST ${step}] ${name}`);
  console.log(`==================================================`);
  console.log(`URL: ${url}`);
  console.log(`Method: ${method}`);
  console.log(`Headers: ${JSON.stringify(headers, null, 2)}`);
  if (body) {
    console.log(`Request Body:\n${JSON.stringify(body, null, 2)}`);
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const status = res.status;
    let data: any;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    console.log(`\nHTTP Status: ${status} (Expected: ${expectedStatus})`);
    console.log(`Response Body:\n${typeof data === "object" ? JSON.stringify(data, null, 2) : data}`);

    const check = validator(status, data);
    console.log(`Result: ${check.success ? "PASS [OK]" : "FAIL [ERROR]"}`);
    if (check.notes) console.log(`Notes: ${check.notes}`);

    results.push({
      step,
      name,
      httpStatus: status,
      expectedStatus,
      protocolVersion: data?.result?.protocolVersion || "2024-11-05",
      request: body || { method, url },
      response: data,
      success: check.success,
      notes: check.notes,
    });
  } catch (err: any) {
    console.log(`Execution Exception: ${err.message}`);
    results.push({
      step,
      name,
      httpStatus: 0,
      expectedStatus,
      request: body,
      response: { error: err.message },
      success: false,
      notes: err.message,
    });
  }
}

async function main() {
  console.log("Starting Comprehensive Protocol & Security Verification...");

  // ==========================================
  // 第二阶段：协议测试 (Phase 2)
  // ==========================================

  // A. GET /health
  await runStep(
    "2.A",
    "GET /health 端点存活与 Nexus 连通探测",
    `${BRIDGE_URL}/health`,
    "GET",
    {},
    null,
    200,
    (status, data) => ({
      success: status === 200 && data.ok === true && data.nexus?.connected === true,
      notes: `Nexus connected: ${data.nexus?.connected}, Projects count: ${data.nexus?.projectsCount}`,
    })
  );

  // B. MCP initialize
  await runStep(
    "2.B",
    "MCP initialize 握手协商 (标准 MCP 协议)",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "init-001",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "gemini-spark-custom-app",
          version: "1.0.0",
        },
      },
    },
    200,
    (status, data) => ({
      success: status === 200 && data.result?.serverInfo?.name === "nexus-mcp-bridge",
      notes: `Server: ${data.result?.serverInfo?.name} v${data.result?.serverInfo?.version}, Protocol: ${data.result?.protocolVersion}`,
    })
  );

  // Send notifications/initialized (lifecycle requirement)
  await fetch(`${BRIDGE_URL}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  });

  // C. MCP tools/list
  await runStep(
    "2.C",
    "MCP tools/list 工具白名单发现",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "tools-list-001",
      method: "tools/list",
      params: {},
    },
    200,
    (status, data) => {
      const toolNames = data.result?.tools?.map((t: any) => t.name) || [];
      const hasAllWhitelisted = [
        "nexus_project_list",
        "nexus_project_info",
        "nexus_directory_list",
        "nexus_file_read",
        "nexus_file_create",
        "nexus_file_write",
        "nexus_git_status",
        "nexus_runtime_list",
      ].every((t) => toolNames.includes(t));

      const noShell = !toolNames.some((t: string) => t.includes("shell") || t.includes("command"));

      return {
        success: status === 200 && toolNames.length === 8 && hasAllWhitelisted && noShell,
        notes: `Registered tools count: ${toolNames.length}. Tools: [${toolNames.join(", ")}]`,
      };
    }
  );

  // D. MCP tools/call nexus_project_list
  await runStep(
    "2.D",
    "MCP tools/call nexus_project_list 实际调用 Nexus 获取项目",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "call-proj-001",
      method: "tools/call",
      params: {
        name: "nexus_project_list",
        arguments: {},
      },
    },
    200,
    (status, data) => {
      const text = data.result?.content?.[0]?.text;
      const parsed = text ? JSON.parse(text) : null;
      const hasProjects = parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0;
      return {
        success: status === 200 && hasProjects,
        notes: `Found ${parsed?.projects?.length} projects: ${parsed?.projects?.map((p: any) => p.name).join(", ")}`,
      };
    }
  );

  // E. MCP tools/call nexus_directory_list
  await runStep(
    "2.E",
    "MCP tools/call nexus_directory_list 列出项目目录",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "call-dir-001",
      method: "tools/call",
      params: {
        name: "nexus_directory_list",
        arguments: {
          projectId: "Myweb",
          path: ".",
        },
      },
    },
    200,
    (status, data) => {
      const text = data.result?.content?.[0]?.text;
      return {
        success: status === 200 && text && text.includes("entries"),
        notes: `Directory list returned valid entries from Myweb`,
      };
    }
  );

  // F. MCP tools/call nexus_file_read
  await runStep(
    "2.F",
    "MCP tools/call nexus_file_read 读取项目内真实文件",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "call-file-001",
      method: "tools/call",
      params: {
        name: "nexus_file_read",
        arguments: {
          projectId: "Myweb",
          path: "index.html",
          limit: 10,
        },
      },
    },
    200,
    (status, data) => {
      const text = data.result?.content?.[0]?.text;
      return {
        success: status === 200 && text && text.length > 0 && !data.result?.isError,
        notes: `Successfully read index.html from Myweb (${text?.length} chars)`,
      };
    }
  );

  // ==========================================
  // 第三阶段：安全测试 (Phase 3)
  // ==========================================

  // 3.1 无 Authorization
  await runStep(
    "3.1",
    "安全测试：缺失 Authorization Header 应当返回 401",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "sec-001",
      method: "tools/list",
      params: {},
    },
    401,
    (status, data) => ({
      success: status === 401 && data.error?.message?.includes("Unauthorized"),
      notes: `Rejected with HTTP ${status}: ${data.error?.message}`,
    })
  );

  // 3.2 错误 Token
  await runStep(
    "3.2",
    "安全测试：错误 Bearer Token 应当返回 401",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      Authorization: `Bearer ${INVALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "sec-002",
      method: "tools/list",
      params: {},
    },
    401,
    (status, data) => ({
      success: status === 401 && data.error?.message?.includes("Unauthorized"),
      notes: `Rejected with HTTP ${status}: ${data.error?.message}`,
    })
  );

  // 3.3 ../ 路径穿越攻击拦截
  await runStep(
    "3.3",
    "安全测试：'../' 路径穿越攻击应当被沙箱直接拦截",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "sec-003",
      method: "tools/call",
      params: {
        name: "nexus_file_read",
        arguments: {
          projectId: "Myweb",
          path: "../../Windows/System32/drivers/etc/hosts",
        },
      },
    },
    200,
    (status, data) => {
      const text = data.result?.content?.[0]?.text;
      const isBlocked = text && (text.includes("Security Error") || text.includes("forbidden") || text.includes("traversal"));
      return {
        success: isBlocked === true,
        notes: `Path traversal blocked: ${text}`,
      };
    }
  );

  // 3.4 非白名单工具拦截
  await runStep(
    "3.4",
    "安全测试：调用非白名单工具应当被 MCP 协议层直接拒绝",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "sec-004",
      method: "tools/call",
      params: {
        name: "unauthorized_secret_tool",
        arguments: {},
      },
    },
    200,
    (status, data) => ({
      success: data.error?.code === -32601 || data.result?.isError === true,
      notes: `Rejected non-whitelisted tool with: ${data.error?.message || data.result?.content?.[0]?.text}`,
    })
  );

  // 3.5 危险 command_run 工具必须不存在
  await runStep(
    "3.5",
    "安全测试：尝试调用系统命令工具 command_run 必须被拒绝",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "sec-005",
      method: "tools/call",
      params: {
        name: "localbridge_command_run",
        arguments: { command: "whoami" },
      },
    },
    200,
    (status, data) => ({
      success: data.error?.code === -32601 || data.result?.isError === true,
      notes: `Shell/command tool cannot be accessed: ${data.error?.message || data.result?.content?.[0]?.text}`,
    })
  );

  // 3.6 Token 管理接口禁止暴露
  await runStep(
    "3.6",
    "安全测试：尝试通过 MCP 调用令牌管理接口必须被拒绝",
    `${BRIDGE_URL}/mcp`,
    "POST",
    {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
    },
    {
      jsonrpc: "2.0",
      id: "sec-006",
      method: "tools/call",
      params: {
        name: "create_token",
        arguments: {},
      },
    },
    200,
    (status, data) => ({
      success: data.error?.code === -32601 || data.result?.isError === true,
      notes: `Token management tool cannot be accessed: ${data.error?.message || data.result?.content?.[0]?.text}`,
    })
  );

  console.log("\n==================================================");
  console.log("  TEST SUMMARY REPORT");
  console.log("==================================================");
  const total = results.length;
  const passed = results.filter((r) => r.success).length;
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
  for (const r of results) {
    console.log(`[${r.success ? "PASS" : "FAIL"}] [${r.step}] ${r.name}`);
  }

  if (passed === total) {
    console.log("\n>>> ALL PHASE 2 & PHASE 3 TESTS PASSED PERFECTLY! <<<");
  } else {
    process.exit(1);
  }
}

main().catch(console.error);
