import type { ApprovalRequest } from "@localbridge/protocol";

export type ApprovalRoutingMode = "chat" | "hybrid" | "desktop";

export interface ApprovalProvider {
  readonly name: ApprovalRoutingMode;
  canHandle(request: ApprovalRequest): boolean;
  requestApproval(request: ApprovalRequest): Promise<ApprovalRequest>;
  resolveApproval(
    request: ApprovalRequest,
    action: "approve" | "deny",
    resolvedBy?: string
  ): Promise<ApprovalRequest>;
}

/**
 * ChatApprovalProvider:
 * Routes routine approvals natively into the ChatGPT dialog flow.
 * Desktop acts as observation & fallback.
 */
export class ChatApprovalProvider implements ApprovalProvider {
  readonly name = "chat" as const;

  canHandle(_request: ApprovalRequest): boolean {
    return true;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalRequest> {
    request.decisionSource = "chat";
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
    return request;
  }
}

/**
 * DesktopApprovalProvider:
 * Routes approvals to Nexus Desktop UI for explicit manual operator confirmation.
 */
export class DesktopApprovalProvider implements ApprovalProvider {
  readonly name = "desktop" as const;

  canHandle(_request: ApprovalRequest): boolean {
    return true;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalRequest> {
    request.decisionSource = "desktop";
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
    return request;
  }
}

/**
 * HybridApprovalProvider:
 * Blends chat-native confirmations with Desktop fallback for high-risk or unhandled items.
 */
export class HybridApprovalProvider implements ApprovalProvider {
  readonly name = "hybrid" as const;
  readonly chatProvider: ChatApprovalProvider;
  readonly desktopProvider: DesktopApprovalProvider;

  constructor(
    chatProvider?: ChatApprovalProvider,
    desktopProvider?: DesktopApprovalProvider
  ) {
    this.chatProvider = chatProvider ?? new ChatApprovalProvider();
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
}
