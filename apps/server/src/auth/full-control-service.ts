import crypto from "node:crypto";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type FullControlSession,
  type StartFullControlParams,
  type StopFullControlParams,
  type FullControlStatusDto,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export class FullControlService {
  private readonly sessions = new Map<string, FullControlSession>();
  private readonly clientToSession = new Map<string, string>();

  constructor(
    private readonly isPausedProvider?: () => boolean,
    private readonly logger?: Logger
  ) {}

  /**
   * Start a temporary Full Control session for an AI client.
   * Does NOT permanently mutate client token or stored DB scopes.
   */
  startSession(params: StartFullControlParams): FullControlSession {
    if (this.isPausedProvider && this.isPausedProvider()) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.POLICY_DENIED,
        "Cannot start Full Control Mode while Emergency Stop / Global Pause is active"
      );
    }

    if (params.scope === "device" && !params.confirmedDeviceFullControl) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.INVALID_REQUEST,
        "Device Full Control requires explicit operator confirmation ('我理解这将允许 AI 操作此设备上的文件')"
      );
    }

    if (params.scope === "current-project" && !params.projectId) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.INVALID_REQUEST,
        "Current Project Full Control requires a valid projectId"
      );
    }

    // Stop existing session for this client if any
    const existingSessionId = this.clientToSession.get(params.clientId);
    if (existingSessionId) {
      this.stopSession({ sessionId: existingSessionId });
    }

    const now = Date.now();
    const durationMinutes = params.durationMinutes ?? 30;
    const expiresAt = durationMinutes > 0 ? now + durationMinutes * 60 * 1000 : Number.MAX_SAFE_INTEGER;

    const session: FullControlSession = {
      id: `fcs_${crypto.randomUUID()}`,
      clientId: params.clientId,
      scope: params.scope,
      projectId: params.projectId,
      startedAt: now,
      expiresAt,
      reason: params.reason,
      operatorConfirmedAt: now,
      active: true,
    };

    this.sessions.set(session.id, session);
    this.clientToSession.set(params.clientId, session.id);

    this.logger?.info(
      {
        event: "full_control_started",
        sessionId: session.id,
        clientId: session.clientId,
        scope: session.scope,
        projectId: session.projectId,
        expiresAt: session.expiresAt,
      },
      `Full Control Mode started for client "${session.clientId}" with scope "${session.scope}" (expires in ${durationMinutes} mins)`
    );

    return session;
  }

  /**
   * Stop an active session by session ID or client ID.
   */
  stopSession(params: StopFullControlParams): boolean {
    let targetSessionId = params.sessionId;
    if (!targetSessionId && params.clientId) {
      targetSessionId = this.clientToSession.get(params.clientId);
    }

    if (!targetSessionId) {
      return false;
    }

    const session = this.sessions.get(targetSessionId);
    if (!session) {
      return false;
    }

    session.active = false;
    this.sessions.delete(targetSessionId);
    if (session.clientId && this.clientToSession.get(session.clientId) === targetSessionId) {
      this.clientToSession.delete(session.clientId);
    }

    this.logger?.info(
      {
        event: "full_control_stopped",
        sessionId: targetSessionId,
        clientId: session.clientId,
      },
      `Full Control Mode stopped for client "${session.clientId}"`
    );

    return true;
  }

  /**
   * Terminate all active sessions immediately (e.g. on Emergency Stop).
   */
  stopAll(): void {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sid of sessionIds) {
      this.stopSession({ sessionId: sid });
    }
  }

  /**
   * Get an active, unexpired session for a client.
   */
  getActiveSession(clientId?: string): FullControlSession | null {
    if (this.isPausedProvider && this.isPausedProvider()) {
      return null;
    }

    if (!clientId) {
      // Return any active session (most recent)
      const list = this.listActiveSessions();
      return (list[0] as FullControlSession) ?? null;
    }

    const sessionId = this.clientToSession.get(clientId);
    if (!sessionId) {
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (!session || !session.active) {
      this.clientToSession.delete(clientId);
      return null;
    }

    if (Date.now() > session.expiresAt) {
      this.stopSession({ sessionId });
      return null;
    }

    return session;
  }

  /**
   * List all currently active and unexpired sessions.
   */
  listActiveSessions(): FullControlSession[] {
    if (this.isPausedProvider && this.isPausedProvider()) {
      return [];
    }

    const now = Date.now();
    const activeList: FullControlSession[] = [];

    for (const [id, session] of Array.from(this.sessions.entries())) {
      if (!session.active || now > session.expiresAt) {
        this.stopSession({ sessionId: id });
      } else {
        activeList.push(session);
      }
    }

    return activeList.sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Check if Full Control is active for a given client, project, and target path.
   * Emergency Stop unconditionally overrides and returns false.
   */
  isFullControlActive(clientId?: string, projectId?: string): boolean {
    if (this.isPausedProvider && this.isPausedProvider()) {
      return false;
    }

    const session = this.getActiveSession(clientId);
    if (!session) {
      return false;
    }

    if (session.scope === "device") {
      return true;
    }

    if (session.scope === "current-project") {
      if (projectId && session.projectId) {
        return projectId === session.projectId;
      }
      return true;
    }

    return false;
  }

  /**
   * Returns FullControlStatusDto for management endpoints and UI.
   */
  getStatus(): FullControlStatusDto {
    const allSessions = this.listActiveSessions();
    return {
      enabled: allSessions.length > 0,
      activeSession: (allSessions[0] as FullControlSession) ?? null,
      allSessions,
      isPaused: this.isPausedProvider ? this.isPausedProvider() : false,
    };
  }
}
