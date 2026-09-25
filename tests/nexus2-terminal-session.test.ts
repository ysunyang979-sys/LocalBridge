import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TerminalManager, MAX_TERMINALS_PER_PROJECT } from "../apps/runner/src/terminal/terminal-manager.js";
import { evaluateTerminalInput } from "../packages/security/src/terminal/input-security.js";

describe("Nexus 2.0 Terminal Session Pillar", () => {
  let terminalManager: TerminalManager;

  beforeEach(() => {
    terminalManager = new TerminalManager();
  });

  it("evaluates safe, caution, and dangerous terminal input commands", () => {
    // 1. Safe commands
    const safe1 = evaluateTerminalInput("pwd");
    expect(safe1.riskLevel).toBe("SAFE");
    expect(safe1.requiresApproval).toBe(false);

    const safe2 = evaluateTerminalInput("git status");
    expect(safe2.riskLevel).toBe("SAFE");
    expect(safe2.requiresApproval).toBe(false);

    const safe3 = evaluateTerminalInput("node --version");
    expect(safe3.riskLevel).toBe("SAFE");
    expect(safe3.requiresApproval).toBe(false);

    // 2. Caution commands
    const caution1 = evaluateTerminalInput("npm install");
    expect(caution1.riskLevel).toBe("CAUTION");
    expect(caution1.requiresApproval).toBe(false);

    const caution2 = evaluateTerminalInput("cargo build");
    expect(caution2.riskLevel).toBe("CAUTION");
    expect(caution2.requiresApproval).toBe(false);

    // 3. Dangerous commands
    const dang1 = evaluateTerminalInput("format c:");
    expect(dang1.riskLevel).toBe("DANGEROUS");
    expect(dang1.requiresApproval).toBe(true);

    const dang2 = evaluateTerminalInput("rm -rf /");
    expect(dang2.riskLevel).toBe("DANGEROUS");
    expect(dang2.requiresApproval).toBe(true);

    const dang3 = evaluateTerminalInput("taskkill /f /im test.exe");
    expect(dang3.riskLevel).toBe("DANGEROUS");
    expect(dang3.requiresApproval).toBe(true);

    // 4. Chained compound commands
    const chained = evaluateTerminalInput("npm install && format c:");
    expect(chained.riskLevel).toBe("DANGEROUS");
    expect(chained.requiresApproval).toBe(true);
    expect(chained.commands.length).toBe(2);
  });

  it("starts, writes, reads, resizes, queries status, and stops a terminal session", async () => {
    const startRes = await terminalManager.start({
      projectId: "proj_test_001",
      cols: 100,
      rows: 30,
    });

    expect(startRes.terminalSessionId).toBeDefined();
    expect(startRes.state).toBe("running");
    expect(startRes.cols).toBe(100);
    expect(startRes.rows).toBe(30);

    // Write safe command
    const writeRes = await terminalManager.write({
      terminalSessionId: startRes.terminalSessionId,
      input: "echo test_output\r\n",
    });
    expect(writeRes.riskLevel).toBe("SAFE");
    expect(writeRes.bytesWritten).toBeGreaterThan(0);

    // Read buffered output
    await new Promise((r) => setTimeout(r, 400));
    const readRes = await terminalManager.read({
      terminalSessionId: startRes.terminalSessionId,
    });
    expect(readRes.output).toBeDefined();

    // Resize
    const resizeRes = await terminalManager.resize({
      terminalSessionId: startRes.terminalSessionId,
      cols: 120,
      rows: 40,
    });
    expect(resizeRes.success).toBe(true);
    expect(resizeRes.cols).toBe(120);

    // Status
    const statusRes = await terminalManager.status({
      terminalSessionId: startRes.terminalSessionId,
    });
    expect(statusRes.state).toBe("running");
    expect(statusRes.cols).toBe(120);

    // Stop
    const stopRes = await terminalManager.stop({
      terminalSessionId: startRes.terminalSessionId,
    });
    expect(stopRes.state).toBe("stopped");
  });

  it("enforces project concurrency limit of 8 terminal sessions", async () => {
    const startedIds: string[] = [];
    try {
      for (let i = 0; i < MAX_TERMINALS_PER_PROJECT; i++) {
        const res = await terminalManager.start({
          projectId: "proj_limit_test",
        });
        startedIds.push(res.terminalSessionId);
      }

      // 9th should throw RESOURCE_LIMIT
      await expect(
        terminalManager.start({
          projectId: "proj_limit_test",
        })
      ).rejects.toThrow(/RESOURCE_LIMIT/);
    } finally {
      for (const id of startedIds) {
        await terminalManager.stop({ terminalSessionId: id }).catch(() => {});
      }
    }
  });

  it("blocks dangerous terminal write without approval", async () => {
    const startRes = await terminalManager.start({
      projectId: "proj_sec_test",
    });

    try {
      const writeRes = await terminalManager.write({
        terminalSessionId: startRes.terminalSessionId,
        input: "format c:\r\n",
      });

      expect(writeRes.riskLevel).toBe("DANGEROUS");
      expect(writeRes.requiresApproval).toBe(true);
      expect(writeRes.bytesWritten).toBe(0);
    } finally {
      await terminalManager.stop({ terminalSessionId: startRes.terminalSessionId }).catch(() => {});
    }
  });
});
