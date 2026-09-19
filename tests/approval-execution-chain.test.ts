import { describe, expect, it, vi } from "vitest";
import { canonicalPayloadHash } from "@localbridge/shared";
import { ApprovalManager } from "../apps/runner/src/approvals/manager.js";
import { createFileDeleteHandler } from "../apps/runner/src/rpc/handlers/file-delete.js";

const payloadA = { projectId: "proj_a", path: "a.txt", expectedHash: "sha256:a" };
const payloadB = { projectId: "proj_a", path: "b.txt", expectedHash: "sha256:b" };
const fsService = (deleteFile = vi.fn()) => ({ deleteFile, assertDeleteAuthorized: vi.fn() }) as any;

function approved(manager: ApprovalManager, payload = payloadA, timeoutMs = 60_000) {
  const request = manager.create({
    projectId: payload.projectId,
    operation: "file.delete",
    risk: "DANGEROUS",
    summary: "Delete test file",
    payloadHash: canonicalPayloadHash(payload),
    timeoutMs,
  });
  manager.resolve({ approvalId: request.id, action: "approve", resolvedBy: "test-user" });
  return request.id;
}

describe("protected action approval execution chain", () => {
  it("rejects a protected action with no approval", async () => {
    const handler = createFileDeleteHandler(fsService(), new ApprovalManager());
    await expect(handler(payloadA as any)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });

  it("executes A with an approval bound to A", async () => {
    const manager = new ApprovalManager();
    const deleteFile = vi.fn().mockResolvedValue({ deleted: true });
    const handler = createFileDeleteHandler(fsService(deleteFile), manager);
    await handler({ ...payloadA, approvalId: approved(manager) } as any);
    expect(deleteFile).toHaveBeenCalledWith(payloadA);
  });

  it("rejects using an approval for A on B", async () => {
    const manager = new ApprovalManager();
    const handler = createFileDeleteHandler(fsService(), manager);
    await expect(handler({ ...payloadB, approvalId: approved(manager) } as any))
      .rejects.toMatchObject({ code: "APPROVAL_PAYLOAD_MISMATCH" });
  });

  it("rejects replay", async () => {
    const manager = new ApprovalManager();
    const id = approved(manager);
    const handler = createFileDeleteHandler(fsService(vi.fn().mockResolvedValue({})), manager);
    await handler({ ...payloadA, approvalId: id } as any);
    await expect(handler({ ...payloadA, approvalId: id } as any))
      .rejects.toMatchObject({ code: "APPROVAL_ALREADY_RESOLVED" });
  });

  it("rejects expired and post-restart approvals", async () => {
    const manager = new ApprovalManager();
    const expiredId = approved(manager, payloadA, 100);
    const handler = createFileDeleteHandler(fsService(), manager);
    const expiresAt = manager.get(expiredId)!.expiresAt;
    const now = vi.spyOn(Date, "now").mockReturnValue(expiresAt + 1);
    await expect(handler({ ...payloadA, approvalId: expiredId } as any))
      .rejects.toMatchObject({ code: "APPROVAL_EXPIRED" });
    now.mockRestore();
    const oldId = approved(new ApprovalManager());
    const restarted = createFileDeleteHandler(fsService(), new ApprovalManager());
    await expect(restarted({ ...payloadA, approvalId: oldId } as any))
      .rejects.toMatchObject({ code: "APPROVAL_NOT_FOUND" });
  });

  it("consumes approval even when execution fails", async () => {
    const manager = new ApprovalManager();
    const id = approved(manager);
    const handler = createFileDeleteHandler(fsService(vi.fn().mockRejectedValue(new Error("disk failure"))), manager);
    await expect(handler({ ...payloadA, approvalId: id } as any)).rejects.toThrow("disk failure");
    await expect(handler({ ...payloadA, approvalId: id } as any))
      .rejects.toMatchObject({ code: "APPROVAL_ALREADY_RESOLVED" });
  });
});
