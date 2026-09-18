import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";

describe("Phase 8 - Project Execution Mode Policy & Registry", () => {
  let tempDir: string;
  let registryPath: string;
  let testProjectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-exec-mode-test-"));
    registryPath = path.join(tempDir, "projects.json");
    testProjectDir = path.join(tempDir, "sample-project");
    fs.mkdirSync(testProjectDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("newly added project defaults to executionMode 'disabled'", () => {
    const registry = new ProjectRegistry(registryPath);
    const record = registry.add(testProjectDir, {
      name: "Test Project",
    });

    expect(record.executionMode).toBe("disabled");

    const info = registry.infoPublic(record.id);
    expect(info.executionMode).toBe("disabled");
  });

  it("migrates legacy records without executionMode to 'disabled'", () => {
    // Write legacy projects.json without executionMode field
    const legacyState = {
      version: 1,
      projects: [
        {
          id: "proj_legacy123",
          name: "Legacy Project",
          rootPath: testProjectDir,
          canonicalRoot: testProjectDir,
          accessMode: "read-write",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          enabled: true,
        },
      ],
    };
    fs.writeFileSync(registryPath, JSON.stringify(legacyState, null, 2), "utf-8");

    const registry = new ProjectRegistry(registryPath);
    const record = registry.get("proj_legacy123");
    expect(record).toBeDefined();
    expect(record!.executionMode).toBe("disabled");

    const publicList = registry.listPublic();
    expect(publicList[0].executionMode).toBe("disabled");
  });

  it("allows setting executionMode to 'safe-only' on read-only project", () => {
    const registry = new ProjectRegistry(registryPath);
    const record = registry.add(testProjectDir, {
      name: "ReadOnly Project",
      accessMode: "read-only",
    });

    const updated = registry.setExecutionMode(record.id, "safe-only");
    expect(updated.executionMode).toBe("safe-only");
  });

  it("rejects setting executionMode to 'project-code' on read-only project", () => {
    const registry = new ProjectRegistry(registryPath);
    const record = registry.add(testProjectDir, {
      name: "ReadOnly Project",
      accessMode: "read-only",
    });

    expect(() => {
      registry.setExecutionMode(record.id, "project-code");
    }).toThrowError(LocalBridgeError);

    try {
      registry.setExecutionMode(record.id, "project-code");
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(
        LocalBridgeErrorCode.PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS
      );
    }
  });

  it("allows setting executionMode to 'project-code' on read-write project", () => {
    const registry = new ProjectRegistry(registryPath);
    const record = registry.add(testProjectDir, {
      name: "ReadWrite Project",
      accessMode: "read-write",
    });

    const updated = registry.setExecutionMode(record.id, "project-code");
    expect(updated.executionMode).toBe("project-code");
  });

  it("automatically downgrades executionMode to 'disabled' when accessMode is changed to read-only", () => {
    const registry = new ProjectRegistry(registryPath);
    const record = registry.add(testProjectDir, {
      name: "ReadWrite Project",
      accessMode: "read-write",
    });

    registry.setExecutionMode(record.id, "project-code");
    expect(registry.get(record.id)!.executionMode).toBe("project-code");

    // Change accessMode to read-only
    const downgraded = registry.setAccessMode(record.id, "read-only");
    expect(downgraded.accessMode).toBe("read-only");
    expect(downgraded.executionMode).toBe("disabled");
  });
});
