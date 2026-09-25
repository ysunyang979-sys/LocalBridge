import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateProcessOwnership,
  validateProcessKillAuthorization,
  isSystemProtectedProcess,
} from "../packages/security/src/process/ownership.js";
import { ProcessOwnershipTracker } from "../apps/runner/src/process/ownership-tracker.js";

describe("Nexus 2.0 Process Management Pillar", () => {
  let tracker: ProcessOwnershipTracker;

  beforeEach(() => {
    tracker = new ProcessOwnershipTracker();
  });

  it("evaluates ownership correctly across OWNED, VERIFIED_DERIVED, PROBABLE, SYSTEM, FOREIGN", () => {
    // 1. SYSTEM process
    const sysProc = {
      pid: 654,
      name: "csrss.exe",
      executablePath: "C:\\Windows\\System32\\csrss.exe",
    };
    const sysEval = evaluateProcessOwnership(sysProc);
    expect(sysEval.ownership).toBe("SYSTEM");
    expect(isSystemProtectedProcess(sysProc.name, sysProc.executablePath)).toBe(true);

    const killSys = validateProcessKillAuthorization(sysEval.ownership, true);
    expect(killSys.allowed).toBe(false);
    expect(killSys.errorCode).toBe("SYSTEM_PROCESS_PROTECTED");

    // 2. OWNED process
    const creationRecord = {
      pid: 2026,
      projectId: "proj_app_1",
      processStartTime: "13300000000000",
      executablePath: "C:\\Program Files\\nodejs\\node.exe",
      cwd: "C:\\Projects\\App",
      createdAt: Date.now(),
    };
    const liveOwned = {
      pid: 2026,
      name: "node.exe",
      executablePath: "C:\\Program Files\\nodejs\\node.exe",
      cwd: "C:\\Projects\\App",
      startTime: "13300000000000",
    };
    const ownedEval = evaluateProcessOwnership(
      liveOwned,
      "proj_app_1",
      "C:\\Projects\\App",
      creationRecord
    );
    expect(ownedEval.ownership).toBe("OWNED");
    expect(ownedEval.score).toBeGreaterThanOrEqual(150);

    const killOwned = validateProcessKillAuthorization(ownedEval.ownership, false);
    expect(killOwned.allowed).toBe(true);

    // 3. PID Reuse Attack Detection: creation record exists, but live process startTime is different
    const liveReusedPid = {
      pid: 2026,
      name: "node.exe",
      startTime: "13399999999999", // Different start time!
    };
    const reusedEval = evaluateProcessOwnership(
      liveReusedPid,
      "proj_app_1",
      "C:\\Projects\\App",
      creationRecord
    );
    expect(reusedEval.reasons.some((r) => r.includes("PID reuse detected"))).toBe(true);

    // 4. VERIFIED_DERIVED process (child of owned process)
    const childProc = {
      pid: 3030,
      ppid: 2026,
      name: "vite.exe",
      cwd: "C:\\Projects\\App",
    };
    const derivedEval = evaluateProcessOwnership(
      childProc,
      "proj_app_1",
      "C:\\Projects\\App",
      undefined,
      creationRecord
    );
    expect(derivedEval.ownership).toBe("VERIFIED_DERIVED");

    // 5. UNOWNED / PROBABLE process (user manually opened powershell in project dir)
    const externalProc = {
      pid: 4040,
      name: "pwsh.exe",
      cwd: "C:\\Projects\\App",
    };
    const externalEval = evaluateProcessOwnership(
      externalProc,
      "proj_app_1",
      "C:\\Projects\\App"
    );
    expect(["PROBABLE", "UNOWNED"]).toContain(externalEval.ownership);

    // Default deny without approval
    const killExternalNoApproval = validateProcessKillAuthorization(externalEval.ownership, false);
    expect(killExternalNoApproval.allowed).toBe(false);
    expect(killExternalNoApproval.errorCode).toBe("PROCESS_OWNERSHIP_UNVERIFIED");

    // Allowed with approval
    const killExternalWithApproval = validateProcessKillAuthorization(externalEval.ownership, true);
    expect(killExternalWithApproval.allowed).toBe(true);
  });

  it("lists and builds process tree from live OS inspection", async () => {
    const list = await tracker.listProcesses(undefined, "ALL");
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);

    const tree = await tracker.buildProcessTree();
    expect(tree.roots.length).toBeGreaterThan(0);
    expect(tree.totalProcesses).toBeGreaterThan(0);
    expect(Math.abs(tree.totalProcesses - list.length)).toBeLessThan(50);
  });
});
