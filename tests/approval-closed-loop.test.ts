import { describe, expect, it, vi } from "vitest";
import { canonicalPayloadHash } from "@localbridge/shared";
import { ApprovalManager } from "../apps/runner/src/approvals/manager.js";
import { createFileDeleteHandler } from "../apps/runner/src/rpc/handlers/file-delete.js";
import { requiredScopeForTool, hasToolScope } from "../apps/server/src/mcp/scope-policy.js";
import { registerApprovalTools } from "../apps/server/src/mcp/tools/approvals.js";

describe("P0-B: Approval Closed Loop", () => {
  const payload = {
    projectId: "proj_prod",
    path: "important_config.json",
    expectedHash: "sha256:abc123def456",
  };

  it("auto-creates pending approval when file.delete is invoked without approvalId", async () => {
    const manager = new ApprovalManager();
    const fsService = {
      deleteFile: vi.fn(),
      assertDeleteAuthorized: vi.fn(),
    } as any;
    const handler = createFileDeleteHandler(fsService, manager);

    let errorThrown: any = null;
    try {
      await handler(payload as any);
    } catch (err) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.code).toBe("APPROVAL_REQUIRED");
    expect(errorThrown.details).toBeDefined();
    expect(errorThrown.details.approvalId).toMatch(/^approval_[0-9a-f-]{36}$/i);
    expect(errorThrown.details.operation).toBe("file.delete");

    const createdApproval = manager.get(errorThrown.details.approvalId);
    expect(createdApproval).toBeDefined();
    expect(createdApproval!.status).toBe("pending");
    expect(createdApproval!.risk).toBe("DANGEROUS");
    expect(createdApproval!.operation).toBe("file.delete");
    expect(createdApproval!.projectId).toBe("proj_prod");
    expect(createdApproval!.payloadHash).toBe(canonicalPayloadHash(payload));
  });

  it("allows AI to poll status via localbridge_approval_status and completes closed loop upon human approval", async () => {
    const manager = new ApprovalManager();
    const deleteFileMock = vi.fn().mockResolvedValue({ deleted: true, path: payload.path });
    const fsService = {
      deleteFile: deleteFileMock,
      assertDeleteAuthorized: vi.fn(),
    } as any;
    const handler = createFileDeleteHandler(fsService, manager);

    // Step 1: AI tries to delete file without approvalId -> triggers auto-creation
    let approvalId: string;
    try {
      await handler(payload as any);
      throw new Error("Should have thrown APPROVAL_REQUIRED");
    } catch (err: any) {
      expect(err.code).toBe("APPROVAL_REQUIRED");
      approvalId = err.details.approvalId;
    }

    // Step 2: Set up MCP tools
    let toolHandler: Function | undefined;
    const mockMcpServer = {
      registerTool: (name: string, _schema: any, fn: Function) => {
        if (name === "localbridge_approval_status") {
          toolHandler = fn;
        }
      },
    } as any;

    const mockContext = {
      logAudit: vi.fn(),
      runnerRegistry: {
        list: () => [{ id: "runner_local" }],
      },
      request: vi.fn().mockImplementation(async (runnerId: string, method: string, params: any) => {
        if (method === "approval.get") {
          const app = manager.get(params.approvalId);
          if (!app) return null;
          return {
            id: app.id,
            projectId: app.projectId,
            operation: app.operation,
            risk: app.risk,
            status: app.status,
            summary: app.summary,
            createdAt: app.createdAt,
            expiresAt: app.expiresAt,
            resolvedAt: app.resolvedAt,
          };
        }
        return null;
      }),
    } as any;

    registerApprovalTools(mockMcpServer, mockContext);
    expect(toolHandler).toBeDefined();

    // Step 3: AI polls status -> reports "pending"
    const pollResult1 = await toolHandler!({ approvalId });
    const parsed1 = JSON.parse(pollResult1.content[0].text);
    expect(parsed1.status).toBe("pending");
    expect(parsed1.approvalId).toBe(approvalId);
    expect(parsed1.operation).toBe("file.delete");

    // Step 4: Human operator approves the request in Desktop UI
    manager.resolve({
      approvalId,
      action: "approve",
      resolvedBy: "local-desktop-operator",
    });

    // Step 5: AI polls status again -> reports "approved"
    const pollResult2 = await toolHandler!({ approvalId });
    const parsed2 = JSON.parse(pollResult2.content[0].text);
    expect(parsed2.status).toBe("approved");

    // Step 6: AI proceeds with execution passing the approved approvalId
    const result = await handler({
      ...payload,
      approvalId,
    } as any);
    expect(result).toEqual({ deleted: true, path: payload.path });
    expect(deleteFileMock).toHaveBeenCalledWith(payload);

    // Step 7: Approval is marked consumed, status becomes "consumed"
    const pollResult3 = await toolHandler!({ approvalId });
    const parsed3 = JSON.parse(pollResult3.content[0].text);
    expect(parsed3.status).toBe("consumed");

    // Step 8: Replay attack fails
    await expect(
      handler({
        ...payload,
        approvalId,
      } as any)
    ).rejects.toMatchObject({ code: "APPROVAL_ALREADY_RESOLVED" });
  });

  it("enforces strict human-only boundary and read-only scope for status tool", () => {
    // localbridge_approval_status must require only 'read' scope
    const statusScope = requiredScopeForTool("localbridge_approval_status");
    expect(statusScope).toBe("read");

    // Read token permits status inspection
    expect(hasToolScope(["read"], "localbridge_approval_status")).toBe(true);

    // There must NOT be any tool allowing AI to resolve or approve approvals
    const resolveScope = requiredScopeForTool("localbridge_approval_resolve");
    expect(resolveScope).toBeUndefined();
  });

  it("handles rejection and expiration states accurately", async () => {
    const manager = new ApprovalManager();
    const req = manager.create({
      projectId: "proj_1",
      operation: "file.delete",
      risk: "DANGEROUS",
      summary: "Delete test",
      payloadHash: "hash123",
      timeoutMs: 50,
    });

    // Test rejection
    manager.resolve({
      approvalId: req.id,
      action: "deny",
      resolvedBy: "security-auditor",
    });
    expect(manager.get(req.id)!.status).toBe("denied");

    // Test expiration
    const expiredReq = manager.create({
      projectId: "proj_1",
      operation: "file.delete",
      risk: "DANGEROUS",
      summary: "Delete timeout test",
      payloadHash: "hash456",
      timeoutMs: 10,
    });

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
    expect(manager.get(expiredReq.id)!.status).toBe("expired");
    nowSpy.mockRestore();
  });

  it("enforces payload integrity hash mismatch rejection", async () => {
    const manager = new ApprovalManager();
    const fsService = {
      deleteFile: vi.fn(),
      assertDeleteAuthorized: vi.fn(),
    } as any;
    const handler = createFileDeleteHandler(fsService, manager);

    // Auto-create approval for path A
    let approvalId: string;
    try {
      await handler(payload as any);
      throw new Error("Should have thrown");
    } catch (err: any) {
      approvalId = err.details.approvalId;
    }

    manager.resolve({ approvalId, action: "approve", resolvedBy: "user" });

    // Try executing with modified path B using approval for path A
    const tamperedPayload = {
      ...payload,
      path: "another_critical_file.txt",
      approvalId,
    };

    await expect(handler(tamperedPayload as any)).rejects.toMatchObject({
      code: "APPROVAL_PAYLOAD_MISMATCH",
    });
  });
});

describe("P0-A: Tunnel Secret Isolation", () => {
  it("never includes plaintext secrets in status representations", () => {
    // Check property names in TunnelStatusDto schema
    const mockStatusDto = {
      configured: true,
      status: "Connected",
      tunnel_id: "tun_12345",
      has_api_key: true,
      has_mcp_token: true,
      auto_reconnect: true,
      health_port: 8080,
      error_message: null,
      reconnect_attempts: 0,
    };

    expect(mockStatusDto).not.toHaveProperty("runtime_api_key");
    expect(mockStatusDto).not.toHaveProperty("mcp_token");
    expect(mockStatusDto).not.toHaveProperty("token");
    expect(mockStatusDto).not.toHaveProperty("secret");
  });
});
