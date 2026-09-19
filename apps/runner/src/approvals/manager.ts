import crypto from "node:crypto";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type ApprovalRequest,
  type ApprovalCreateParams,
  type ApprovalResolveParams,
  type ApprovalListParams,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export class ApprovalManager {
  private readonly approvals = new Map<string, ApprovalRequest>();
  private readonly consumedIds = new Set<string>();

  constructor(private readonly logger?: Logger) {}

  /**
   * Helper to ensure expired pending requests are updated to "expired".
   */
  private checkExpiry(req: ApprovalRequest): ApprovalRequest {
    if ((req.status === "pending" || req.status === "approved") && Date.now() > req.expiresAt) {
      req.status = "expired";
      this.logger?.debug(
        { approvalId: req.id, projectId: req.projectId },
        "Approval request expired"
      );
    }
    return req;
  }

  /**
   * Create a new approval request in the format approval_<UUIDv4>.
   * Default timeout: 5 minutes (300,000 ms).
   */
  create(params: ApprovalCreateParams): ApprovalRequest {
    const id = `approval_${crypto.randomUUID()}`;
    const now = Date.now();
    const timeoutMs = params.timeoutMs ?? 300000;
    const expiresAt = now + timeoutMs;

    const request: ApprovalRequest = {
      id,
      projectId: params.projectId,
      operation: params.operation,
      risk: params.risk,
      summary: params.summary,
      payloadHash: params.payloadHash,
      createdAt: now,
      expiresAt,
      status: "pending",
      resolvedAt: null,
      resolvedBy: null,
    };

    this.approvals.set(id, request);
    this.logger?.info(
      {
        approvalId: id,
        projectId: params.projectId,
        operation: params.operation,
        risk: params.risk,
      },
      "Approval request created"
    );

    // Limit in-memory retention to 1000 items
    if (this.approvals.size > 1000) {
      const oldestKey = this.approvals.keys().next().value;
      if (oldestKey) this.approvals.delete(oldestKey);
    }

    return { ...request };
  }

  /**
   * Resolve an approval request. Only local human users can resolve.
   */
  resolve(params: ApprovalResolveParams): ApprovalRequest {
    const req = this.approvals.get(params.approvalId);
    if (!req) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_NOT_FOUND,
        `Approval request "${params.approvalId}" not found`
      );
    }

    this.checkExpiry(req);

    if (req.status === "expired") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_EXPIRED,
        `Approval request "${params.approvalId}" has expired`
      );
    }

    if (req.status !== "pending") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_ALREADY_RESOLVED,
        `Approval request "${params.approvalId}" is already ${req.status}`
      );
    }

    req.status = params.action === "approve" ? "approved" : "denied";
    req.resolvedAt = Date.now();
    req.resolvedBy = params.resolvedBy || "local-user";

    this.logger?.info(
      {
        approvalId: req.id,
        status: req.status,
        resolvedBy: req.resolvedBy,
      },
      `Approval request ${req.status}`
    );

    return { ...req };
  }

  /**
   * Verify an approval and consume it for one-time execution.
   * Returns true if valid and consumed; throws error or returns false otherwise.
   */
  verifyAndConsume(
    approvalId: string,
    projectId: string,
    operation: string,
    payloadHash: string
  ): boolean {
    const req = this.approvals.get(approvalId);
    if (!req) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_NOT_FOUND,
        `Approval request "${approvalId}" not found`
      );
    }

    this.checkExpiry(req);

    if (req.status === "expired") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_EXPIRED,
        `Approval request "${approvalId}" has expired`
      );
    }

    if (this.consumedIds.has(approvalId)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_ALREADY_RESOLVED,
        `Approval "${approvalId}" has already been consumed (one-time approval)`
      );
    }

    if (req.status !== "approved") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_ALREADY_RESOLVED,
        `Approval request "${approvalId}" is not approved (current status: ${req.status})`
      );
    }

    if (req.projectId !== projectId) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH,
        `Approval project mismatch: expected "${req.projectId}", got "${projectId}"`
      );
    }

    if (req.operation !== operation) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH,
        `Approval operation mismatch: expected "${req.operation}", got "${operation}"`
      );
    }

    if (req.payloadHash !== payloadHash) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH,
        "Approval payload hash mismatch. Operation parameters have changed."
      );
    }

    // Consume approval so it cannot be reused
    this.consumedIds.add(approvalId);
    this.logger?.info(
      { approvalId, projectId, operation },
      "Approval consumed for one-time execution"
    );

    return true;
  }

  /**
   * List approvals matching optional filter.
   */
  list(filter?: ApprovalListParams): ApprovalRequest[] {
    const results: ApprovalRequest[] = [];
    for (const req of this.approvals.values()) {
      this.checkExpiry(req);
      if (filter?.projectId && req.projectId !== filter.projectId) {
        continue;
      }
      if (filter?.status && req.status !== filter.status) {
        continue;
      }
      results.push({ ...req });
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get an approval request by ID.
   */
  get(approvalId: string): ApprovalRequest | undefined {
    const req = this.approvals.get(approvalId);
    if (!req) return undefined;
    this.checkExpiry(req);
    return { ...req };
  }

  /**
   * Transition all pending approvals to expired (called on restart/reboot).
   */
  expireAll(): void {
    for (const req of this.approvals.values()) {
      if (req.status === "pending") {
        req.status = "expired";
      }
    }
  }
}
