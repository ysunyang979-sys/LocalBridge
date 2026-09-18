import { describe, it, expect } from "vitest";
import { CommandClassifier, CommandPolicy } from "@localbridge/security";
import type { CommandSpec } from "@localbridge/protocol";

describe("Phase 8 - Command Risk Engine & Policy", () => {
  describe("CommandClassifier", () => {
    it("classifies tool-version as SAFE", () => {
      const spec: CommandSpec = {
        kind: "tool-version",
        projectId: "proj_123",
        tool: "node",
      };

      const result = CommandClassifier.classify(spec);
      expect(result.risk).toBe("SAFE");
      expect(result.executesProjectCode).toBe(false);
      expect(result.mayModifyFiles).toBe(false);
      expect(result.mayAccessNetwork).toBe(false);
    });

    it("classifies valid node-script as CAUTION", () => {
      const spec: CommandSpec = {
        kind: "node-script",
        projectId: "proj_123",
        path: "scripts/build.js",
        args: ["--mode", "prod"],
        cwd: ".",
        timeoutMs: 60000,
      };

      const result = CommandClassifier.classify(spec);
      expect(result.risk).toBe("CAUTION");
      expect(result.executesProjectCode).toBe(true);
    });

    it("classifies valid python-script as CAUTION", () => {
      const spec: CommandSpec = {
        kind: "python-script",
        projectId: "proj_123",
        path: "scripts/analysis.py",
        args: ["--input", "data.csv"],
        cwd: ".",
        timeoutMs: 60000,
      };

      const result = CommandClassifier.classify(spec);
      expect(result.risk).toBe("CAUTION");
      expect(result.executesProjectCode).toBe(true);
    });

    it("classifies standard package-script as CAUTION", () => {
      const spec: CommandSpec = {
        kind: "package-script",
        projectId: "proj_123",
        manager: "pnpm",
        script: "build",
        args: [],
        cwd: ".",
        timeoutMs: 60000,
      };

      const result = CommandClassifier.classify(spec);
      expect(result.risk).toBe("CAUTION");
      expect(result.executesProjectCode).toBe(true);
    });

    it("blocks dangerous package lifecycle scripts as DANGEROUS", () => {
      const lifecycleScripts = [
        "install",
        "postinstall",
        "preinstall",
        "prepare",
        "prepack",
        "postpack",
      ];

      for (const script of lifecycleScripts) {
        const spec: CommandSpec = {
          kind: "package-script",
          projectId: "proj_123",
          manager: "npm",
          script,
          args: [],
          cwd: ".",
          timeoutMs: 60000,
        };

        const result = CommandClassifier.classify(spec);
        expect(result.risk).toBe("DANGEROUS");
      }
    });

    it("blocks prohibited package manager commands as DANGEROUS", () => {
      const prohibitedCommands = ["publish", "login", "adduser", "token"];

      for (const script of prohibitedCommands) {
        const spec: CommandSpec = {
          kind: "package-script",
          projectId: "proj_123",
          manager: "npm",
          script,
          args: [],
          cwd: ".",
          timeoutMs: 60000,
        };

        const result = CommandClassifier.classify(spec);
        expect(result.risk).toBe("DANGEROUS");
      }
    });

    it("blocks node evaluation flags (-e, --eval, -p, --print) as DANGEROUS", () => {
      const flags = ["-e", "--eval", "-p", "--print"];

      for (const flag of flags) {
        const spec: CommandSpec = {
          kind: "node-script",
          projectId: "proj_123",
          path: "app.js",
          args: [flag, "process.exit(0)"],
          cwd: ".",
          timeoutMs: 60000,
        };

        const result = CommandClassifier.classify(spec);
        expect(result.risk).toBe("DANGEROUS");
      }
    });

    it("blocks python evaluation flags (-c) as DANGEROUS", () => {
      const spec: CommandSpec = {
        kind: "python-script",
        projectId: "proj_123",
        path: "main.py",
        args: ["-c", "import sys; sys.exit(0)"],
        cwd: ".",
        timeoutMs: 60000,
      };

      const result = CommandClassifier.classify(spec);
      expect(result.risk).toBe("DANGEROUS");
    });

    it("blocks scripts with non-script extensions as DANGEROUS", () => {
      const spec: CommandSpec = {
        kind: "node-script",
        projectId: "proj_123",
        path: "script.sh",
        args: [],
        cwd: ".",
        timeoutMs: 60000,
      };

      const result = CommandClassifier.classify(spec);
      expect(result.risk).toBe("DANGEROUS");
    });

    it("blocks package scripts with path traversal or option flags as DANGEROUS", () => {
      const invalidScripts = ["../evil", "-v", "--silent", "foo/bar", "foo\\bar"];

      for (const script of invalidScripts) {
        const spec: CommandSpec = {
          kind: "package-script",
          projectId: "proj_123",
          manager: "npm",
          script,
          args: [],
          cwd: ".",
          timeoutMs: 60000,
        };

        const result = CommandClassifier.classify(spec);
        expect(result.risk).toBe("DANGEROUS");
      }
    });
  });

  describe("CommandPolicy", () => {
    const safeAssessment = {
      risk: "SAFE" as const,
      reasons: ["Safe inspection"],
      executesProjectCode: false,
      mayModifyFiles: false,
      mayAccessNetwork: false,
    };

    const cautionAssessment = {
      risk: "CAUTION" as const,
      reasons: ["Executes code"],
      executesProjectCode: true,
      mayModifyFiles: true,
      mayAccessNetwork: true,
    };

    const dangerousAssessment = {
      risk: "DANGEROUS" as const,
      reasons: ["Prohibited flag"],
      executesProjectCode: true,
      mayModifyFiles: true,
      mayAccessNetwork: true,
    };

    it("mode 'disabled' rejects all commands", () => {
      expect(CommandPolicy.evaluate("disabled", "read-write", safeAssessment).allowed).toBe(false);
      expect(CommandPolicy.evaluate("disabled", "read-write", cautionAssessment).allowed).toBe(false);
      expect(CommandPolicy.evaluate("disabled", "read-write", dangerousAssessment).allowed).toBe(false);
    });

    it("mode 'safe-only' permits SAFE commands and rejects CAUTION and DANGEROUS", () => {
      expect(CommandPolicy.evaluate("safe-only", "read-only", safeAssessment).allowed).toBe(true);
      expect(CommandPolicy.evaluate("safe-only", "read-only", cautionAssessment).allowed).toBe(false);
      expect(CommandPolicy.evaluate("safe-only", "read-only", dangerousAssessment).allowed).toBe(false);
    });

    it("mode 'project-code' requires read-write accessMode", () => {
      const decision = CommandPolicy.evaluate("project-code", "read-only", cautionAssessment);
      expect(decision.allowed).toBe(false);
      expect(decision.requiredAccessMode).toBe("read-write");
    });

    it("mode 'project-code' permits SAFE and CAUTION commands with read-write access", () => {
      expect(CommandPolicy.evaluate("project-code", "read-write", safeAssessment).allowed).toBe(true);
      expect(CommandPolicy.evaluate("project-code", "read-write", cautionAssessment).allowed).toBe(true);
    });

    it("mode 'project-code' strictly rejects DANGEROUS commands even with read-write access", () => {
      expect(CommandPolicy.evaluate("project-code", "read-write", dangerousAssessment).allowed).toBe(false);
    });
  });
});
