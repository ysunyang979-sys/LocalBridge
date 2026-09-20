import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type ApprovalRequest,
  type ApprovalRoutingMode,
} from "@localbridge/protocol";
import type { ApprovalManager, OperationApprovalContext } from "./manager.js";

export type { ApprovalRoutingMode };

export interface ApprovalProvider {
  readonly name: ApprovalRoutingMode;
  canHandle(request: ApprovalRequest): boolean;
  requestApproval(request: ApprovalRequest): Promise<ApprovalRequest>;
  resolveApproval(
    request: ApprovalRequest,
    action: "approve" | "deny",
    resolvedBy?: string
  ): Promise<ApprovalRequest>;
  handleOperation(
    context: OperationApprovalContext,
    manager: ApprovalManager
  ): void;
}

/**
 * ChatHostApprovalProvider:
 * Write/execute tools are presented to the user via ChatGPT Host's native App Action Approval.
 * When the tool is invoked by ChatGPT, user has approved in-chat.
 * Nexus executes immediately without throwing APPROVAL_REQUIRED (eliminating double approval).
 */
export class ChatHostApprovalProvider implements ApprovalProvider {
  readonly name = "chat" as const;

  canHandle(_request: ApprovalRequest): boolean {
    return true;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalRequest> {
    request.decisionSource = "chat";
    request.approvalMode = "chat";
    return request;
  }

  async resolveApproval(
    request: ApprovalRequest,
    action: "approve" | "deny",
    resolvedBy = "chat-user"
  ): Promise<ApprovalRequest> {
    request.status = action === "approve" ? "approved" : "denied";
    request.resolvedAt = Date.now();
    request.resolvedBy = resolvedBy;
    request.decisionSource = "chat";
    request.approvalMode = "chat";
    return request;
  }

  handleOperation(
    context: OperationApprovalContext,
    manager: ApprovalManager
  ): void {
    if (context.approvalId) {
      manager.verifyAndConsume(
        context.approvalId,
        context.projectId,
        context.operation,
        context.payloadHash
      );
      return;
    }

    // In chat mode, ChatGPT Host App Action Approval already verified with user
    manager.createImmediateResolved({
      projectId: context.projectId,
      operation: context.operation,
      risk: context.risk,
      summary: context.summary,
      payloadHash: context.payloadHash,
      decisionSource: "chat",
      approvalMode: "chat",
      resolvedBy: "chat-user",
    });
  }
}

// Backward-compatible alias
export const ChatApprovalProvider = ChatHostApprovalProvider;

/**
 * AutoApprovalProvider:
 * Routine ASK operations are automatically approved and executed without user intervention.
 * Safety guards: DENY, protected files (when always-ask), project read-only / disabled, and emergency stop
 * are NEVER bypassed.
 */
export class AutoApprovalProvider implements ApprovalProvider {
  readonly name = "auto-trusted" as const;

  canHandle(_request: ApprovalRequest): boolean {
    return true;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalRequest> {
    request.decisionSource = "auto";
    request.approvalMode = "auto-trusted";
    return request;
  }

  async resolveApproval(
    request: ApprovalRequest,
    action: "approve" | "deny",
    resolvedBy = "auto-trusted"
  ): Promise<ApprovalRequest> {
    request.status = action === "approve" ? "approved" : "denied";
    request.resolvedAt = Date.now();
    request.resolvedBy = resolvedBy;
    request.decisionSource = "auto";
    request.approvalMode = "auto-trusted";
    return request;
  }

  handleOperation(
    context: OperationApprovalContext,
    manager: ApprovalManager
  ): void {
    // Safety guard: Protected files (with always-ask) must NOT be bypassed in auto-trusted mode
    if (context.isProtectedFile) {
      if (context.approvalId) {
        manager.verifyAndConsume(
          context.approvalId,
          context.projectId,
          context.operation,
          context.payloadHash
        );
        return;
      }

      const approval = manager.create({
        projectId: context.projectId,
        operation: context.operation,
        risk: context.risk === "SAFE" ? "CAUTION" : context.risk,
        summary: context.summary,
        payloadHash: context.payloadHash,
        timeoutMs: context.timeoutMs ?? 300000,
        decisionSource: "protected-file",
      });

      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_REQUIRED,
        `Protected file operation requires explicit human approval. Approval request "${approval.id}" created. Please review and approve in LocalBridge Desktop and retry with approvalId: "${approval.id}".`,
        {
          code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
          approvalId: approval.id,
          operation: context.operation,
          projectId: context.projectId,
          summary: approval.summary,
          expiresAt: approval.expiresAt,
        }
      );
    }

    if (context.approvalId) {
      manager.verifyAndConsume(
        context.approvalId,
        context.projectId,
        context.operation,
        context.payloadHash
      );
      return;
    }

    // Auto-approve and consume for immediate execution
    manager.createImmediateResolved({
      projectId: context.projectId,
      operation: context.operation,
      risk: context.risk,
      summary: context.summary,
      payloadHash: context.payloadHash,
      decisionSource: "auto",
      approvalMode: "auto-trusted",
      resolvedBy: "auto-trusted",
    });
  }
}

/**
 * DesktopApprovalProvider:
 * High-security compatibility mode.
 * Routes approvals to Nexus Desktop UI for explicit manual operator confirmation.
 */
export class DesktopApprovalProvider implements ApprovalProvider {
  readonly name = "desktop" as const;

  canHandle(_request: ApprovalRequest): boolean {
    return true;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalRequest> {
    request.decisionSource = "desktop";
    request.approvalMode = "desktop";
    return request;
  }

  async resolveApproval(
    request: ApprovalRequest,
    action: "approve" | "deny",
    resolvedBy = "local-user"
  ): Promise<ApprovalRequest> {
    request.status = action === "approve" ? "approved" : "denied";
    request.resolvedAt = Date.now();
    request.resolvedBy = resolvedBy;
    request.decisionSource = "desktop";
    request.approvalMode = "desktop";
    return request;
  }

  handleOperation(
    context: OperationApprovalContext,
    manager: ApprovalManager
  ): void {
    if (context.approvalId) {
      manager.verifyAndConsume(
        context.approvalId,
        context.projectId,
        context.operation,
        context.payloadHash
      );
      return;
    }

    const approval = manager.create({
      projectId: context.projectId,
      operation: context.operation,
      risk: context.risk === "SAFE" ? "CAUTION" : context.risk,
      summary: context.summary,
      payloadHash: context.payloadHash,
      timeoutMs: context.timeoutMs ?? 300000,
      decisionSource: "desktop",
    });

    throw new LocalBridgeError(
      LocalBridgeErrorCode.APPROVAL_REQUIRED,
      `Operation requires human approval. Approval request "${approval.id}" created for "${context.summary}". Please ask the user to review and approve in LocalBridge Desktop, check status with localbridge_approval_status(approvalId: "${approval.id}"), and retry with approvalId: "${approval.id}".`,
      {
        code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
        approvalId: approval.id,
        operation: context.operation,
        projectId: context.projectId,
        summary: approval.summary,
        expiresAt: approval.expiresAt,
      }
    );
  }
}

/**
 * HybridApprovalProvider:
 * Blends chat-native confirmations with Desktop fallback for dangerous operations.
 */
export class HybridApprovalProvider implements ApprovalProvider {
  readonly name = "hybrid" as const;
  readonly chatProvider: ChatHostApprovalProvider;
  readonly desktopProvider: DesktopApprovalProvider;

  constructor(
    chatProvider?: ChatHostApprovalProvider,
    desktopProvider?: DesktopApprovalProvider
  ) {
    this.chatProvider = chatProvider ?? new ChatHostApprovalProvider();
    this.desktopProvider = desktopProvider ?? new DesktopApprovalProvider();
  }

  canHandle(request: ApprovalRequest): boolean {
    return (
      this.chatProvider.canHandle(request) ||
      this.desktopProvider.canHandle(request)
    );
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalRequest> {
    request.decisionSource = "hybrid";
    request.approvalMode = "hybrid";
    return request;
  }

  async resolveApproval(
    request: ApprovalRequest,
    action: "approve" | "deny",
    resolvedBy?: string
  ): Promise<ApprovalRequest> {
    const isChat = resolvedBy?.toLowerCase().includes("chat");
    return isChat
      ? this.chatProvider.resolveApproval(request, action, resolvedBy)
      : this.desktopProvider.resolveApproval(request, action, resolvedBy);
  }

  handleOperation(
    context: OperationApprovalContext,
    manager: ApprovalManager
  ): void {
    if (context.risk === "DANGEROUS") {
      this.desktopProvider.handleOperation(context, manager);
    } else {
      this.chatProvider.handleOperation(context, manager);
    }
  }
}
