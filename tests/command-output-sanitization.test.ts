import { describe, it, expect } from "vitest";
import os from "node:os";
import {
  stripAnsiAndControlCodes,
  redactPhysicalPaths,
  sanitizeProcessOutput,
} from "../apps/runner/src/process/output.js";

describe("Phase 8 - Command Output Sanitization & Path Redaction", () => {
  it("strips ANSI colors and CSI sequences while preserving text", () => {
    const colored = "\x1b[31mRed Error\x1b[0m and \x1b[32;1mBold Green\x1b[0m";
    expect(stripAnsiAndControlCodes(colored)).toBe("Red Error and Bold Green");
  });

  it("strips OSC hyperlinks while preserving link label text", () => {
    const linked = "\x1b]8;;https://example.com\x1b\\Click Here\x1b]8;;\x1b\\ to view";
    expect(stripAnsiAndControlCodes(linked)).toBe("Click Here to view");
  });

  it("preserves Chinese characters, emojis, tabs, and newlines", () => {
    const unicodeInput = "Line 1: 运行成功 🚀\r\n\tLine 2: 编译完成 ✨\n";
    expect(stripAnsiAndControlCodes(unicodeInput)).toBe(unicodeInput);
  });

  it("strips non-printable ASCII control characters", () => {
    const bellAndNull = "Hello\x00World\x07!";
    expect(stripAnsiAndControlCodes(bellAndNull)).toBe("HelloWorld!");
  });

  it("redacts physical paths with canonical project root and runner state placeholders", () => {
    const projectRoot = process.platform === "win32" ? "E:\\workspace\\my-project" : "/var/workspace/my-project";
    const runnerState = process.platform === "win32" ? "C:\\Users\\User\\.localbridge" : "/home/user/.localbridge";

    const output = `Error in ${projectRoot}\\src\\index.ts: backup created at ${runnerState}\\backups\\123.bak`;
    const sanitized = redactPhysicalPaths(output, [
      { rawPath: projectRoot, placeholder: "<project-root>" },
      { rawPath: runnerState, placeholder: "<runner-state>" },
    ]);

    expect(sanitized).toContain("<project-root>\\src\\index.ts");
    expect(sanitized).toContain("<runner-state>\\backups\\123.bak");
    expect(sanitized).not.toContain(projectRoot);
    expect(sanitized).not.toContain(runnerState);
  });

  it("handles mixed forward and backward slashes in paths", () => {
    const projectRoot = "E:/workspace/mixed-path";
    const output = "File at E:\\workspace\\mixed-path\\app.js";

    const sanitized = redactPhysicalPaths(output, [
      { rawPath: projectRoot, placeholder: "<project-root>" },
    ]);

    expect(sanitized).toBe("File at <project-root>\\app.js");
  });

  it("sanitizeProcessOutput combines ANSI stripping and path redactions", () => {
    const home = os.homedir();
    const raw = `\x1b[31mFailure\x1b[0m at ${home}/secrets.txt`;

    const sanitized = sanitizeProcessOutput(raw);
    expect(sanitized).toContain("Failure at <user-home>");
    expect(sanitized).not.toContain("\x1b[31m");
    expect(sanitized).not.toContain(home);
  });
});
