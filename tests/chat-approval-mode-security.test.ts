import { describe, expect, it, vi } from "vitest";
import {
  ApprovalManager,
  ChatHostApprovalProvider,
} from "../apps/runner/src/approvals/index.js";
import { createFileWriteHandler } from "../apps/runner/src/rpc/handlers/file-write.js";
import { createFileReadHandler } from "../apps/runner/src/rpc/handlers/file-read.js";
import { createGitCommitHandler } from "../apps/runner/src/rpc/handlers/git-commit.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import { isBuildDefinitionFile, isProtectedFile } from "@localbridge/security";

describe("P1 Security: 'chat' Approval Mode Hardening", () => {
  const projectId = "proj_chat_security";

  const createMockProjectRegistry = (options: {
    accessMode?: "read-only" | "read-write";
    enabled?: boolean;
  } = {}) => ({
    get: vi.fn().mockReturnValue({
      id: projectId,
      canonicalRoot: "E:/workspace/dummy_project",
      enabled: options.enabled ?? true,
      accessMode: options.accessMode ?? "read-write",
      executionMode: "project-code",
      trustPolicy: {
        trustLevel: "custom",
        filePolicy: "ask",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
        customRules: {
          files: {
            create: "ask",
            write: "ask",
            patch: "ask",
            delete: "ask",
          },
        },
      },
    }),
    isSessionTrusted: vi.fn().mockReturnValue(false),
  } as any);

  const createMockFsService = () => ({
    writeFile: vi.fn().mockResolvedValue({
      path: "src/app.ts",
      bytesWritten: 42,
      hash: "sha256:dummy",
    }),
    readText: vi.fn().mockResolvedValue({
      path: "src/app.ts",
      content: "console.log('hello');",
      bytes: 21,
      hash: "sha256:dummy",
    }),
  } as any);

  const createMockGitService = () => ({
    commit: vi.fn().mockResolvedValue({
      commitHash: "abcdef1234567890",
      shortHash: "abcdef1",
      author: "Nexus Operator",
      message: "feat: security update",
    }),
  } as any);

  // 1. Non-ChatGPT tokens must NOT auto-approve in chat mode
  it("rejects auto-approval in chat mode when token lacks purpose: 'chatgpt'", () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");

    let err: any = null;
    try {
      manager.handleOperationApproval({
        projectId,
        operation: "file.write",
        risk: "CAUTION",
        summary: "Write src/app.ts",
        payloadHash: "hash_test_1",
        timeoutMs: 300000,
        callerPurpose: undefined, // Non-ChatGPT caller!
      });
    } catch (e) {
      err = e;
    }

    expect(err).not.toBeNull();
    expect(err.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
    expect(err.message).toMatch(/approval/i);

    const pending = manager.get(err.details.approvalId);
    expect(pending).toBeDefined();
    expect(pending?.status).toBe("pending");
  });

  // 2. Protected files MUST force desktop approval even with purpose: "chatgpt" in chat mode
  it("forces desktop approval for protected file read even in chat mode with ChatGPT token", () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");

    let err: any = null;
    try {
      manager.handleOperationApproval({
        projectId,
        operation: "file.read",
        risk: "CAUTION",
        summary: "Read file .env",
        payloadHash: "hash_test_env",
        timeoutMs: 300000,
        isProtectedFile: true,
        callerPurpose: "chatgpt",
      });
    } catch (e) {
      err = e;
    }

    expect(err).not.toBeNull();
    expect(err.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
    const pending = manager.get(err.details.approvalId);
    expect(pending).toBeDefined();
    expect(pending?.status).toBe("pending");
    expect(pending?.decisionSource).toBe("protected-file");
  });

  it("forces desktop approval for protected file write even in chat mode with ChatGPT token", () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");

    let err: any = null;
    try {
      manager.handleOperationApproval({
        projectId,
        operation: "file.write",
        risk: "CAUTION",
        summary: "Write file .env",
        payloadHash: "hash_test_env_write",
        timeoutMs: 300000,
        isProtectedFile: true,
        callerPurpose: "chatgpt",
      });
    } catch (e) {
      err = e;
    }

    expect(err).not.toBeNull();
    expect(err.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
    const pending = manager.get(err.details.approvalId);
    expect(pending).toBeDefined();
    expect(pending?.status).toBe("pending");
    expect(pending?.decisionSource).toBe("protected-file");
  });

  // 3. Modifying build definition files MUST force desktop approval
  it("forces desktop approval when modifying build definition files (package.json, Makefile, .husky, CI)", () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");

    const buildFiles = [
      "package.json",
      "Makefile",
      "GNUmakefile",
      ".husky/pre-commit",
      ".github/workflows/ci.yml",
      ".gitlab-ci.yml",
      "CMakeLists.txt",
      "Cargo.toml",
    ];

    for (const file of buildFiles) {
      expect(isBuildDefinitionFile(file)).toBe(true);

      let err: any = null;
      try {
        manager.handleOperationApproval({
          projectId,
          operation: "file.write",
          risk: "CAUTION",
          summary: `Write ${file}`,
          payloadHash: `hash_${file}`,
          timeoutMs: 300000,
          isBuildDefinition: true,
          callerPurpose: "chatgpt",
        });
      } catch (e) {
        err = e;
      }

      expect(err).not.toBeNull();
      expect(err.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
      const pending = manager.get(err.details.approvalId);
      expect(pending?.status).toBe("pending");
    }
  });

  // 4. packageInstall commands MUST force desktop approval
  it("forces desktop approval for packageInstall / package manager commands even in chat mode", () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");

    let err: any = null;
    try {
      manager.handleOperationApproval({
        projectId,
        operation: "command.run",
        risk: "CAUTION",
        summary: "Execute command: npm install",
        payloadHash: "hash_npm_install",
        timeoutMs: 300000,
        commandCategory: "package-install",
        isPackageInstall: true,
        callerPurpose: "chatgpt",
      });
    } catch (e) {
      err = e;
    }

    expect(err).not.toBeNull();
    expect(err.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
    const pending = manager.get(err.details.approvalId);
    expect(pending?.status).toBe("pending");
  });

  // 5. git commit MUST force desktop approval
  it("forces desktop approval for git commit even in chat mode with ChatGPT token", () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");

    let err: any = null;
    try {
      manager.handleOperationApproval({
        projectId,
        operation: "git.commit",
        risk: "DANGEROUS",
        summary: "Commit staged changes",
        payloadHash: "hash_git_commit",
        timeoutMs: 300000,
        callerPurpose: "chatgpt",
      });
    } catch (e) {
      err = e;
    }

    expect(err).not.toBeNull();
    expect(err.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
    const pending = manager.get(err.details.approvalId);
    expect(pending?.status).toBe("pending");
  });

  // 6. Routine operations with verified ChatGPT token succeed in chat mode
  it("allows routine non-protected operations to execute immediately with purpose: 'chatgpt'", () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");

    expect(() => {
      manager.handleOperationApproval({
        projectId,
        operation: "file.write",
        risk: "CAUTION",
        summary: "Write src/components/Button.tsx",
        payloadHash: "hash_button",
        timeoutMs: 300000,
        callerPurpose: "chatgpt",
        isProtectedFile: false,
        isBuildDefinition: false,
      });
    }).not.toThrow();

    const approvals = manager.list();
    expect(approvals.length).toBe(1);
    expect(approvals[0].status).toBe("consumed");
    expect(approvals[0].resolvedBy).toBe("chat-user");
    expect(approvals[0].decisionSource).toBe("chat");
  });

  // 7. End-to-end RPC handlers honor the constraints
  it("file-write handler forces desktop approval when writing package.json or .env in chat mode", async () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");
    const fsService = createMockFsService();
    const projectRegistry = createMockProjectRegistry();
    const handler = createFileWriteHandler(fsService, manager, projectRegistry);

    // 1. Write package.json
    await expect(
      handler({
        projectId,
        path: "package.json",
        expectedHash: "old_hash",
        content: '{"name":"hacked"}',
        callerPurpose: "chatgpt",
      } as any)
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
    });

    // 2. Write .env
    await expect(
      handler({
        projectId,
        path: ".env",
        expectedHash: "old_hash",
        content: "API_KEY=stolen",
        callerPurpose: "chatgpt",
      } as any)
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
    });

    // 3. Write without callerPurpose (stolen/generic token)
    await expect(
      handler({
        projectId,
        path: "src/utils.ts",
        expectedHash: "old_hash",
        content: "export const x = 1;",
      } as any)
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
    });

    // 4. Routine write with callerPurpose: "chatgpt" succeeds
    const result = await handler({
      projectId,
      path: "src/utils.ts",
      expectedHash: "old_hash",
      content: "export const x = 1;",
      callerPurpose: "chatgpt",
    } as any);
    expect(result).toBeDefined();
    expect(fsService.writeFile).toHaveBeenCalled();
  });

  it("file-read handler forces desktop approval when reading .env in chat mode", async () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");
    const fsService = createMockFsService();
    const projectRegistry = createMockProjectRegistry();
    const handler = createFileReadHandler(fsService, manager, projectRegistry);

    await expect(
      handler({
        projectId,
        path: ".env",
        callerPurpose: "chatgpt",
      } as any)
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
    });

    // Routine read succeeds
    const result = await handler({
      projectId,
      path: "src/index.ts",
      callerPurpose: "chatgpt",
    } as any);
    expect(result).toBeDefined();
    expect(fsService.readText).toHaveBeenCalled();
  });

  it("git-commit handler forces desktop approval in chat mode", async () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");
    const gitService = createMockGitService();
    const projectRegistry = createMockProjectRegistry();
    const handler = createGitCommitHandler(gitService, manager, projectRegistry);

    await expect(
      handler({
        projectId,
        message: "feat: unauthorized commit",
        callerPurpose: "chatgpt",
      } as any)
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
    });
  });

  it("desktop approval resolution enables one-time consumption for previously blocked operations", async () => {
    const manager = new ApprovalManager();
    manager.setRoutingMode("chat");
    const fsService = createMockFsService();
    const projectRegistry = createMockProjectRegistry();
    const handler = createFileWriteHandler(fsService, manager, projectRegistry);

    let approvalId: string = "";
    try {
      await handler({
        projectId,
        path: "package.json",
        expectedHash: "old_hash",
        content: '{"name":"updated"}',
        callerPurpose: "chatgpt",
      } as any);
    } catch (err: any) {
      approvalId = err.details.approvalId;
    }

    expect(approvalId).toBeTruthy();

    // Desktop operator approves
    manager.resolve({
      approvalId,
      action: "approve",
      resolvedBy: "local-user",
    });

    // Retrying with approvalId succeeds
    const res = await handler({
      projectId,
      path: "package.json",
      expectedHash: "old_hash",
      content: '{"name":"updated"}',
      approvalId,
      callerPurpose: "chatgpt",
    } as any);

    expect(res).toBeDefined();
    expect(manager.get(approvalId)?.status).toBe("consumed");
  });
});
