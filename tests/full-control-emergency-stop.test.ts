import { describe, it, expect, beforeEach } from "vitest";
import { FullControlService } from "../apps/server/src/auth/full-control-service.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("Emergency Stop & Full Control Primacy Suite", () => {
  let isGlobalPaused: boolean;
  let service: FullControlService;

  beforeEach(() => {
    isGlobalPaused = false;
    service = new FullControlService(() => isGlobalPaused);
  });

  it("prohibits starting Full Control while Emergency Stop / Global Pause is active", () => {
    isGlobalPaused = true;

    expect(() => {
      service.startSession({
        clientId: "client_chatgpt",
        scope: "current-project",
        projectId: "proj_123",
        durationMinutes: 30,
      });
    }).toThrowError(/Cannot start Full Control Mode while Emergency Stop \/ Global Pause is active/);

    expect(service.listActiveSessions().length).toBe(0);
  });

  it("immediately invalidates active sessions when Emergency Stop is triggered", () => {
    // 1. Start session normally
    const session = service.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: "proj_123",
      durationMinutes: 30,
    });

    expect(service.isFullControlActive("client_chatgpt", "proj_123")).toBe(true);

    // 2. Operator triggers Emergency Stop
    isGlobalPaused = true;

    // Full control check must immediately return FALSE
    expect(service.isFullControlActive("client_chatgpt", "proj_123")).toBe(false);
    expect(service.getActiveSession("client_chatgpt")).toBeNull();

    // 3. Emergency stop handler calls stopAll() to terminate sessions permanently
    service.stopAll();
    expect(service.listActiveSessions().length).toBe(0);

    // 4. Even when unpaused later, previous session remains dead
    isGlobalPaused = false;
    expect(service.isFullControlActive("client_chatgpt", "proj_123")).toBe(false);
    expect(service.getActiveSession("client_chatgpt")).toBeNull();
  });

  it("reports correct status through getStatus()", () => {
    // Initially not active
    let status = service.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.activeSession).toBeNull();
    expect(status.isPaused).toBe(false);

    // Start session
    service.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: "proj_myweb",
      durationMinutes: 30,
    });

    status = service.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.activeSession?.projectId).toBe("proj_myweb");
    expect(status.isPaused).toBe(false);

    // Pause system
    isGlobalPaused = true;
    status = service.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.activeSession).toBeNull();
    expect(status.isPaused).toBe(true);
  });
});
