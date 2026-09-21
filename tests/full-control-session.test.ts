import { describe, it, expect, beforeEach } from "vitest";
import { FullControlService } from "../apps/server/src/auth/full-control-service.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("Nexus Full Control Session Management Suite", () => {
  let service: FullControlService;
  let isPaused: boolean;

  beforeEach(() => {
    isPaused = false;
    service = new FullControlService(() => isPaused);
  });

  it("starts a project-scoped full control session successfully", () => {
    const session = service.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: "proj_myweb",
      durationMinutes: 30,
      reason: "User authorized emptying workspace",
    });

    expect(session.id).toMatch(/^fcs_/);
    expect(session.clientId).toBe("client_chatgpt");
    expect(session.scope).toBe("current-project");
    expect(session.projectId).toBe("proj_myweb");
    expect(session.active).toBe(true);
    expect(session.expiresAt).toBeGreaterThan(session.startedAt);

    // Verify active session lookup
    const active = service.getActiveSession("client_chatgpt");
    expect(active).not.toBeNull();
    expect(active?.id).toBe(session.id);

    // Verify permission query
    expect(service.isFullControlActive("client_chatgpt", "proj_myweb")).toBe(true);
    // Different project should NOT have full control
    expect(service.isFullControlActive("client_chatgpt", "proj_other")).toBe(false);
  });

  it("enforces multi-client isolation: elevating client A does NOT elevate client B", () => {
    service.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: "proj_myweb",
      durationMinutes: 15,
    });

    // ChatGPT has full control
    expect(service.isFullControlActive("client_chatgpt", "proj_myweb")).toBe(true);

    // Kimi, Claude, Gemini do NOT have full control
    expect(service.isFullControlActive("client_kimi", "proj_myweb")).toBe(false);
    expect(service.isFullControlActive("client_claude", "proj_myweb")).toBe(false);
    expect(service.getActiveSession("client_kimi")).toBeNull();
    expect(service.getActiveSession("client_claude")).toBeNull();
  });

  it("requires explicit secondary confirmation for device-wide full control", () => {
    // Attempting without confirmation must fail
    expect(() => {
      service.startSession({
        clientId: "client_chatgpt",
        scope: "device",
        durationMinutes: 30,
        confirmedDeviceFullControl: false,
      });
    }).toThrowError(/Device Full Control requires explicit operator confirmation/);

    // With confirmation it succeeds
    const session = service.startSession({
      clientId: "client_chatgpt",
      scope: "device",
      durationMinutes: 30,
      confirmedDeviceFullControl: true,
      reason: "System maintenance",
    });

    expect(session.scope).toBe("device");
    expect(service.isFullControlActive("client_chatgpt")).toBe(true);
    // Device scope applies across any project
    expect(service.isFullControlActive("client_chatgpt", "any_project")).toBe(true);
    expect(service.isFullControlActive("client_chatgpt", undefined, "C:\\Users\\test")).toBe(true);
  });

  it("requires projectId for current-project scope", () => {
    expect(() => {
      service.startSession({
        clientId: "client_chatgpt",
        scope: "current-project",
        durationMinutes: 30,
      });
    }).toThrowError(/requires a valid projectId/);
  });

  it("automatically expires after designated duration", () => {
    const session = service.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: "proj_myweb",
      durationMinutes: 10,
    });

    expect(service.isFullControlActive("client_chatgpt", "proj_myweb")).toBe(true);

    // Simulate clock advancing past expiry
    session.expiresAt = Date.now() - 1000;

    // Must be expired now
    expect(service.isFullControlActive("client_chatgpt", "proj_myweb")).toBe(false);
    expect(service.getActiveSession("client_chatgpt")).toBeNull();
  });

  it("allows manual termination of a full control session", () => {
    const session = service.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: "proj_myweb",
      durationMinutes: 30,
    });

    expect(service.isFullControlActive("client_chatgpt", "proj_myweb")).toBe(true);

    const stopped = service.stopSession({ sessionId: session.id });
    expect(stopped).toBe(true);

    expect(service.isFullControlActive("client_chatgpt", "proj_myweb")).toBe(false);
    expect(service.getActiveSession("client_chatgpt")).toBeNull();
  });

  it("stopAll terminates all active sessions across all clients", () => {
    service.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: "proj_myweb",
      durationMinutes: 30,
    });

    service.startSession({
      clientId: "client_claude",
      scope: "device",
      confirmedDeviceFullControl: true,
      durationMinutes: 30,
    });

    expect(service.listActiveSessions().length).toBe(2);

    service.stopAll();

    expect(service.listActiveSessions().length).toBe(0);
    expect(service.isFullControlActive("client_chatgpt", "proj_myweb")).toBe(false);
    expect(service.isFullControlActive("client_claude")).toBe(false);
  });
});
