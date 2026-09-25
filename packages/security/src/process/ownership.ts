import path from "node:path";
import type { ProcessOwnershipGrade } from "@localbridge/protocol";

export const SYSTEM_PROTECTED_PROCESS_NAMES = new Set([
  "system",
  "system idle process",
  "registry",
  "smss.exe",
  "csrss.exe",
  "wininit.exe",
  "services.exe",
  "lsass.exe",
  "svchost.exe",
  "fontdrvhost.exe",
  "dwm.exe",
  "winlogon.exe",
  "explorer.exe",
  "spoolsv.exe",
  "sihost.exe",
  "taskhostw.exe",
  "runtimebroker.exe",
  "ctfmon.exe",
  "shellexperiencehost.exe",
  "startmenuexperiencehost.exe",
  "searchapp.exe",
  "searchindexer.exe",
  "securityhealthservice.exe",
  "msmpeng.exe",
  "mpcmdrun.exe",
  "nisrv.exe",
  "init",
  "systemd",
  "kthreadd",
  "launchd",
]);

export const SYSTEM_PROTECTED_PATHS = [
  "\\windows\\system32",
  "\\windows\\syswow64",
  "\\windows\\winsxs",
  "\\windows\\boot",
  "/sbin",
  "/usr/sbin",
  "/system",
];

export function isSystemProtectedProcess(name: string, executablePath?: string): boolean {
  const lowerName = name.toLowerCase().trim();
  if (SYSTEM_PROTECTED_PROCESS_NAMES.has(lowerName)) {
    return true;
  }
  if (executablePath) {
    const lowerPath = executablePath.toLowerCase().replace(/\//g, "\\");
    for (const sysPath of SYSTEM_PROTECTED_PATHS) {
      if (lowerPath.includes(sysPath.replace(/\//g, "\\"))) {
        // Exclude cmd.exe, powershell.exe, pwsh.exe if spawned as child of developer tools,
        // but if it's svchost or services, it's already caught above
        if (
          lowerName === "csrss.exe" ||
          lowerName === "lsass.exe" ||
          lowerName === "services.exe" ||
          lowerName === "wininit.exe" ||
          lowerName === "smss.exe"
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export interface StoredProcessCreationRecord {
  pid: number;
  projectId: string;
  sessionId?: string;
  agentTaskId?: string;
  terminalSessionId?: string;
  runtimeId?: string;
  jobId?: string;
  processStartTime: string;
  executablePath: string;
  cwd: string;
  createdAt: number;
}

export interface LiveProcessInfo {
  pid: number;
  ppid?: number;
  name: string;
  commandLine?: string;
  executablePath?: string;
  cwd?: string;
  startTime?: string;
}

export interface OwnershipEvaluationResult {
  score: number;
  ownership: ProcessOwnershipGrade;
  reasons: string[];
}

export function evaluateProcessOwnership(
  liveProc: LiveProcessInfo,
  targetProjectId?: string,
  targetProjectRoot?: string,
  storedRecord?: StoredProcessCreationRecord,
  verifiedParentRecord?: StoredProcessCreationRecord
): OwnershipEvaluationResult {
  const reasons: string[] = [];
  let score = 0;

  // 1. System process check - hard rule: ALWAYS SYSTEM
  if (isSystemProtectedProcess(liveProc.name, liveProc.executablePath)) {
    return {
      score: 0,
      ownership: "SYSTEM",
      reasons: ["Process is a protected operating system process"],
    };
  }

  // 2. Nexus creation record check
  if (storedRecord) {
    score += 100;
    reasons.push("Nexus recorded creation of this process (+100)");

    if (targetProjectId && storedRecord.projectId === targetProjectId) {
      score += 20;
      reasons.push("Process explicitly belongs to requested project (+20)");
    }

    // PID + processStartTime match
    if (storedRecord.processStartTime && liveProc.startTime) {
      if (storedRecord.processStartTime === liveProc.startTime) {
        score += 50;
        reasons.push("Process start time matches creation record (+50)");
      } else {
        reasons.push("PID reuse detected: process start time does not match stored record");
      }
    } else {
      score += 25;
      reasons.push("PID match confirmed (+25)");
    }

    if (storedRecord.runtimeId) {
      score += 30;
      reasons.push("Directly associated with active Runtime (+30)");
    }
    if (storedRecord.terminalSessionId) {
      score += 20;
      reasons.push("Directly associated with active Terminal (+20)");
    }
    if (storedRecord.agentTaskId) {
      score += 20;
      reasons.push("Directly associated with active Agent Task (+20)");
    }
  }

  // 3. Verified derived child check
  if (!storedRecord && verifiedParentRecord) {
    score += 30;
    reasons.push(`Verified child of Nexus-owned process PID ${verifiedParentRecord.pid} (+30)`);
    if (verifiedParentRecord.runtimeId) score += 20;
    if (verifiedParentRecord.terminalSessionId) score += 15;
  }

  // 4. Project context matching
  if (targetProjectRoot) {
    const normalizedProjectRoot = path.resolve(targetProjectRoot).toLowerCase();

    if (liveProc.cwd) {
      const normalizedCwd = path.resolve(liveProc.cwd).toLowerCase();
      if (normalizedCwd === normalizedProjectRoot || normalizedCwd.startsWith(normalizedProjectRoot + path.sep)) {
        score += 10;
        reasons.push("Working directory matches project root (+10)");
      }
    }

    if (liveProc.commandLine && liveProc.commandLine.toLowerCase().includes(normalizedProjectRoot)) {
      score += 10;
      reasons.push("Command line references project directory (+10)");
    }

    if (liveProc.executablePath) {
      const normalizedExe = path.resolve(liveProc.executablePath).toLowerCase();
      if (normalizedExe.startsWith(normalizedProjectRoot + path.sep)) {
        score += 10;
        reasons.push("Executable resides within project directory (+10)");
      }
    }
  }

  // Determine grade based on score and criteria
  let ownership: ProcessOwnershipGrade;
  if (storedRecord && score >= 120) {
    ownership = "OWNED";
  } else if (verifiedParentRecord && score >= 40) {
    ownership = "VERIFIED_DERIVED";
  } else if (score >= 20) {
    ownership = "PROBABLE";
  } else if (score > 0) {
    ownership = "UNOWNED";
  } else {
    ownership = "FOREIGN";
  }


  return {
    score,
    ownership,
    reasons,
  };
}

export function validateProcessKillAuthorization(
  ownership: ProcessOwnershipGrade,
  hasApproval: boolean
): { allowed: boolean; errorCode?: string; reason?: string } {
  if (ownership === "SYSTEM") {
    return {
      allowed: false,
      errorCode: "SYSTEM_PROCESS_PROTECTED",
      reason: "Protected system processes cannot be terminated by Nexus under any circumstances.",
    };
  }

  if (ownership === "OWNED" || ownership === "VERIFIED_DERIVED") {
    return { allowed: true };
  }

  // For PROBABLE, UNOWNED, FOREIGN: Default Deny unless approved
  if (!hasApproval) {
    return {
      allowed: false,
      errorCode: "PROCESS_OWNERSHIP_UNVERIFIED",
      reason: "Nexus cannot verify that this process belongs to the requested project. Explicit approval required.",
    };
  }

  return { allowed: true };
}
