import { describe, expect, it, vi } from "vitest";
import {
  ApprovalManager,
  ChatHostApprovalProvider,
  AutoApprovalProvider,
  DesktopApprovalProvider,
} from "../apps/runner/src/approvals/index.js";
import { createFileWriteHandler } from "../apps/runner/src/rpc/handlers/file-write.js";
import { createCommandRunHandler } from "../apps/runner/src/rpc/handlers/command-run.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";

describe("Nexus Approval UX Overhaul — 3 Approval Modes (chat / auto-trusted / desktop)", () => {
  const projectId = "proj_approval_modes";

  // Mock project registry
  const createMockProjectRegistry = (options: {
    accessMode?: "read-only" | "read-write";
    executionMode?: "disabled" | "safe-only" | "project-code";
    enabled?: boolean;
    trustPolicy?: any;
  }) => {
    return {
      get: vi.fn().mockReturnValue({
        id: projectId,
        canonicalRoot: "E:/workspace/dummy_project",
        enabled: options.enabled ?? true,
        accessMode: options.accessMode ?? "read-write",
        executionMode: options.executionMode ?? "project-code",
        trustPolicy: options.trustPolicy ?? {
          trustLevel: "standard",
          filePolicy: "ask",
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
        },
      }),
      evaluateOperation: vi.fn(),
      isProtectedFile: vi.fn(),
    } as any;
  };

  // Mock filesystem service
  const createMockFsService = () => ({
    writeFile: vi.fn().mockResolvedValue({
      path: "src/app.ts",
      bytesWritten: 42,
      hash: "sha256:dummy",
    }),
    assertWriteAuthorized: vi.fn(),
  } as any);

  // Mock process service
  const createMockProcessService = (approvalManager: ApprovalManager) => ({
    run: vi.fn().mockImplementation(async (params: any) => {
      // Evaluate policy for command.run
      if (params.kind === "dangerous-script") {
        throw {
          code: LocalBridgeErrorCode.COMMAND_BLOCKED,
          message: "Command execution blocked by policy",
        };
      }

      // If policy is ask:
      const { approvalId, ...commandPayload } = params;
      const pHash = canonicalPayloadHash(commandPayload);

      approvalManager.handleOperationApproval({
        projectId: params.projectId,
        operation: "command.run",
        risk: "CAUTION",
        summary: `Execute command: ${params.kind} in project "${params.projectId}"`,
        payloadHash: pHash,
        approvalId,
        timeoutMs: 300000,
        decisionSource: "project-policy",
        isProtectedFile: false,
        callerPurpose: params.callerPurpose,
      });

      return {
        exitCode: 0,
        stdout: "command executed successfully",
        stderr: "",
      };
    }),
  } as any);

  // =========================================================================
  // Requirement A: chat mode
  // =========================================================================
  it("Requirement A (chat mode): command.run ASK executes without throwing APPROVAL_REQUIRED, creates no Desktop pending approvals", async () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");
    const processService = createMockProcessService(manager);
    const commandHandler = createCommandRunHandler(processService);

    // Call command.run without approvalId
    const res = await commandHandler({
      projectId,
      kind: "package-script",
      script: "build",
      manager: "npm",
      callerPurpose: "chatgpt",
    } as any);

    expect(res).toBeDefined();
    expect(res.exitCode).toBe(0);

    // Verify no pending approvals exist in manager
    const pending = manager.list({ status: "pending" });
    expect(pending.length).toBe(0);

    // Verify approval record was created and consumed with chat decisionSource
    const chatApprovals = manager.list().filter((a) => a.decisionSource === "chat");
    expect(chatApprovals.length).toBe(1);
    expect(chatApprovals[0].approvalMode).toBe("chat");
    expect(chatApprovals[0].status).toBe("consumed");
    expect(chatApprovals[0].resolvedBy).toBe("chat-user");
  });

  // =========================================================================
  // Requirement B: auto-trusted mode
  // =========================================================================
  it("Requirement B (auto-trusted mode): command.run ASK executes automatically without Desktop pending approvals", async () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("auto-trusted");
    const processService = createMockProcessService(manager);
    const commandHandler = createCommandRunHandler(processService);

    // Call command.run without approvalId
    const res = await commandHandler({
      projectId,
      kind: "node-script",
      path: "scripts/generate.js",
    } as any);

    expect(res).toBeDefined();
    expect(res.exitCode).toBe(0);

    // Verify no pending approvals exist in manager
    const pending = manager.list({ status: "pending" });
    expect(pending.length).toBe(0);

    // Verify audit details: decisionSource = auto, approvalMode = auto-trusted
    const autoApprovals = manager.list().filter((a) => a.decisionSource === "auto");
    expect(autoApprovals.length).toBe(1);
    expect(autoApprovals[0].approvalMode).toBe("auto-trusted");
    expect(autoApprovals[0].status).toBe("consumed");
    expect(autoApprovals[0].resolvedBy).toBe("auto-trusted");
  });

  // =========================================================================
  // Requirement C: desktop mode
  // =========================================================================
  it("Requirement C (desktop mode): retains APPROVAL_REQUIRED + approvalId retry flow", async () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("desktop");
    const processService = createMockProcessService(manager);
    const commandHandler = createCommandRunHandler(processService);

    const payload = {
      projectId,
      kind: "package-script",
      script: "test",
      manager: "npm",
    };

    // Step 1: Call without approvalId -> throws APPROVAL_REQUIRED
    let error: any = null;
    try {
      await commandHandler(payload as any);
    } catch (err) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
    const approvalId = error.details.approvalId;
    expect(approvalId).toBeDefined();

    // Verify pending approval in Desktop
    const pending = manager.list({ status: "pending" });
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(approvalId);
    expect(pending[0].decisionSource).toBe("desktop");

    // Step 2: Operator resolves approval in Desktop UI
    manager.resolve({
      approvalId,
      action: "approve",
      resolvedBy: "desktop-operator",
      decisionSource: "desktop",
    });

    // Step 3: Retry with approvalId -> succeeds and consumes approval
    const retryRes = await commandHandler({
      ...payload,
      approvalId,
    } as any);

    expect(retryRes.exitCode).toBe(0);
    const consumed = manager.get(approvalId);
    expect(consumed?.status).toBe("consumed");

    // Step 4: Replay attack with same approvalId fails (anti-replay)
    await expect(
      commandHandler({
        ...payload,
        approvalId,
      } as any)
    ).rejects.toThrowError(/already been consumed/i);
  });

  // =========================================================================
  // Requirement D: DENY enforcement across all 3 modes
  // =========================================================================
  it("Requirement D: DENY policy strictly rejects in all 3 modes (chat, auto-trusted, desktop)", async () => {
    const modes: Array<"chat" | "auto-trusted" | "desktop"> = [
      "chat",
      "auto-trusted",
      "desktop",
    ];

    for (const mode of modes) {
      const manager = new ApprovalManager();
      manager.setRoutingMode(mode);
      const processService = createMockProcessService(manager);
      const commandHandler = createCommandRunHandler(processService);

      await expect(
        commandHandler({
          projectId,
          kind: "dangerous-script",
        } as any)
      ).rejects.toMatchObject({
        code: LocalBridgeErrorCode.COMMAND_BLOCKED,
      });

      // Ensure no approvals created for DENIED commands
      expect(manager.list().length).toBe(0);
    }
  });

  // =========================================================================
  // Requirement E: Protected Files enforcement across all 3 modes
  // =========================================================================
  it("Requirement E: Protected Files rules (.env with always-ask) require human approval even in auto-trusted mode", async () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("auto-trusted");

    const pHash = canonicalPayloadHash({
      projectId,
      path: ".env",
      content: "SECRET_KEY=12345",
    });

    // Attempting protected file operation in auto-trusted mode MUST NOT be bypassed
    let error: any = null;
    try {
      manager.handleOperationApproval({
        projectId,
        operation: "file.write",
        risk: "CAUTION",
        summary: `Overwrite file ".env" in project "${projectId}"`,
        payloadHash: pHash,
        timeoutMs: 300000,
        isProtectedFile: true, // Marked by policy evaluator as protected file
        decisionSource: "protected-file",
      });
    } catch (err) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
    expect(error.message).toMatch(/protected file/i);

    // Must have created an approval request requiring human intervention
    const approvalId = error.details.approvalId;
    const approvalReq = manager.get(approvalId);
    expect(approvalReq).toBeDefined();
    expect(approvalReq?.status).toBe("pending");
    expect(approvalReq?.decisionSource).toBe("protected-file");
  });

  // =========================================================================
  // Requirement F: Audit decisionSource and approvalMode accuracy
  // =========================================================================
  it("Requirement F: Audit trail correctly records decisionSource and approvalMode across providers", async () => {
    const manager = new ApprovalManager();

    // 1. Chat provider execution
    manager.setRoutingMode("chat");
    manager.handleOperationApproval({
      projectId,
      operation: "file.write",
      risk: "CAUTION",
      summary: "Write src/index.ts",
      payloadHash: "hash_1",
      decisionSource: "chat",
      callerPurpose: "chatgpt",
    });

    // 2. Auto-trusted provider execution
    manager.setRoutingMode("auto-trusted");
    manager.handleOperationApproval({
      projectId,
      operation: "command.run",
      risk: "CAUTION",
      summary: "Run npm test",
      payloadHash: "hash_2",
      decisionSource: "auto",
    });

    // 3. Desktop provider execution
    manager.setRoutingMode("desktop");
    const desktopApproval = manager.create({
      projectId,
      operation: "file.delete",
      risk: "DANGEROUS",
      summary: "Delete old-config.json",
      payloadHash: "hash_3",
      timeoutMs: 300000,
      decisionSource: "desktop",
    });
    manager.resolve({
      approvalId: desktopApproval.id,
      action: "approve",
      resolvedBy: "admin",
      decisionSource: "desktop",
    });
    manager.verifyAndConsume(desktopApproval.id, projectId, "file.delete", "hash_3");

    const all = manager.list();
    expect(all.length).toBe(3);

    const chatItem = all.find((a) => a.summary === "Write src/index.ts");
    expect(chatItem?.decisionSource).toBe("chat");
    expect(chatItem?.approvalMode).toBe("chat");

    const autoItem = all.find((a) => a.summary === "Run npm test");
    expect(autoItem?.decisionSource).toBe("auto");
    expect(autoItem?.approvalMode).toBe("auto-trusted");

    const desktopItem = all.find((a) => a.summary === "Delete old-config.json");
    expect(desktopItem?.decisionSource).toBe("desktop");
    expect(desktopItem?.approvalMode).toBe("desktop");
  });
});
