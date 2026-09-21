import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { MCP_PROTOCOL_VERSION } from "../apps/server/src/mcp/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Skill Security Policy & Zero Scope Elevation", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let readOnlyToken: string;
  let writeToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-security-policy-"));
    dbFilePath = path.join(tmpDir, "policy.db");

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
    serverPort = (serverInstance.app.server.address() as any).port;

    // Token with ONLY "read" scope
    const readTokenRecord = serverInstance.tokenService.createToken({
      name: "mcp-read-only-ai",
      type: "mcp",
      scopes: ["read"],
    });
    readOnlyToken = readTokenRecord.token;

    // Token with "read" + "write" scope
    const writeTokenRecord = serverInstance.tokenService.createToken({
      name: "mcp-write-ai",
      type: "mcp",
      scopes: ["read", "write"],
    });
    writeToken = writeTokenRecord.token;
  });

  afterAll(async () => {
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  async function postMcp(body: any, token: string) {
    return fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        connection: "close",
      },
      body: JSON.stringify(body),
    });
  }

  it("allows read-only token to discover and inspect skills via localbridge_skill_* tools", async () => {
    // 1. localbridge_skill_list works with read-only token
    const listRes = await postMcp(
      {
        jsonrpc: "2.0",
        id: "req_1",
        method: "tools/call",
        params: {
          name: "localbridge_skill_list",
          arguments: {},
        },
      },
      readOnlyToken
    );
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as any;
    expect(listData.result.isError).toBeUndefined();
    const content = JSON.parse(listData.result.content[0].text);
    expect(content.count).toBeGreaterThanOrEqual(8);

    // 2. localbridge_skill_get works with read-only token
    const getRes = await postMcp(
      {
        jsonrpc: "2.0",
        id: "req_2",
        method: "tools/call",
        params: {
          name: "localbridge_skill_get",
          arguments: { skillId: "nexus.project-cleanup" },
        },
      },
      readOnlyToken
    );
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as any;
    const skillContent = JSON.parse(getData.result.content[0].text);
    expect(skillContent.skill.id).toBe("nexus.project-cleanup");
    expect(skillContent.skill.tools).toContain("localbridge_fs_delete");

    // 3. localbridge_skill_match works with read-only token
    const matchRes = await postMcp(
      {
        jsonrpc: "2.0",
        id: "req_3",
        method: "tools/call",
        params: {
          name: "localbridge_skill_match",
          arguments: { query: "清理项目缓存" },
        },
      },
      readOnlyToken
    );
    expect(matchRes.status).toBe(200);
    const matchData = (await matchRes.json()) as any;
    const matchContent = JSON.parse(matchData.result.content[0].text);
    expect(matchContent.matchedSkill?.id).toBe("nexus.project-cleanup");
  });

  it("strictly enforces ZERO scope elevation: read-only token is DENIED when calling tools recommended by skill", async () => {
    // Skill 'nexus.project-cleanup' recommends 'localbridge_fs_delete' (write scope).
    // The read-only token attempts to call 'localbridge_fs_delete'.
    const deleteRes = await postMcp(
      {
        jsonrpc: "2.0",
        id: "req_exploit",
        method: "tools/call",
        params: {
          name: "localbridge_fs_delete",
          arguments: {
            projectId: "some_project",
            path: "dist",
          },
        },
      },
      readOnlyToken
    );

    // Must be rejected with HTTP 403 / insufficient scope error
    expect(deleteRes.status).toBe(403);
    const errorJson = (await deleteRes.json()) as any;
    expect(errorJson.error?.data?.code).toBe("MCP_SCOPE_DENIED");
    expect(errorJson.error?.data?.requiredScope).toBe("write");
  });

  it("halts mutating operations immediately when Emergency Stop is engaged", async () => {
    // Engage pause / emergency stop on MCP context
    serverInstance.mcpContext.setPaused(true);
    expect(serverInstance.mcpContext.isPaused()).toBe(true);

    // Calling mutating tool with write token must be rejected with 503 (Paused)
    const mutatingRes = await postMcp(
      {
        jsonrpc: "2.0",
        id: "req_blocked_emergency",
        method: "tools/call",
        params: {
          name: "localbridge_file_write",
          arguments: {
            projectId: "some_project",
            path: "foo.txt",
            content: "bar",
          },
        },
      },
      writeToken
    );

    expect(mutatingRes.status).toBe(503);
    const err = (await mutatingRes.json()) as any;
    expect(err.error?.code).toBe(-32000);
    expect(err.error?.message).toContain("paused");

    // Clean up pause state
    serverInstance.mcpContext.setPaused(false);
  });
});
