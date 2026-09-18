import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { GitProcessRunner } from "../apps/runner/src/git/process.js";
import { sanitizeGitErrorMessage } from "../apps/runner/src/git/errors.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";

describe("GitProcessRunner - Security & Hardening", () => {
  const runner = new GitProcessRunner();

  it("checks git binary availability", async () => {
    const available = await runner.checkGitAvailable();
    expect(available).toBe(true);
  });

  it("executes git without shell interpolation", async () => {
    // Attempting shell chaining or command injection in arguments
    // Because shell: false is enforced, git treats the entire string as an argument/flag
    await expect(
      runner.exec({
        cwd: process.cwd(),
        args: ["--version; echo injected"],
      })
    ).rejects.toThrow();
  });

  it("enforces timeout on long-running processes", async () => {
    // Using a tiny timeout to guarantee timeout trigger
    await expect(
      runner.exec({
        cwd: process.cwd(),
        // git log on this repository with a 1ms timeout should trigger GIT_TIMEOUT
        args: ["log"],
        timeoutMs: 1,
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_TIMEOUT,
    });
  });

  it("enforces buffer cap on oversized output", async () => {
    // Diff mode: triggers GIT_DIFF_TOO_LARGE
    await expect(
      runner.exec({
        cwd: process.cwd(),
        args: ["log", "-n", "20"],
        maxBufferBytes: 50,
        isDiff: true,
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_DIFF_TOO_LARGE,
    });

    // General output mode: triggers GIT_OUTPUT_TOO_LARGE
    await expect(
      runner.exec({
        cwd: process.cwd(),
        args: ["log", "-n", "20"],
        maxBufferBytes: 50,
        isDiff: false,
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_OUTPUT_TOO_LARGE,
    });
  });

  it("sanitizes physical paths and sensitive roots from error messages", () => {
    const fakeCanonicalRoot = "C:\\Users\\alice\\supersecret\\my-repo";
    const rawStderr =
      "fatal: cannot open C:\\Users\\alice\\supersecret\\my-repo\\.git\\config: Permission denied";
    const sanitized = sanitizeGitErrorMessage(rawStderr, fakeCanonicalRoot);

    expect(sanitized).not.toContain("alice");
    expect(sanitized).not.toContain("supersecret");
    expect(sanitized).toContain("<project-root>");
  });

  it("sanitizes POSIX paths from error messages", () => {
    const rawStderr =
      "fatal: /home/runner/work/secret/repo/.git: not a directory";
    const sanitized = sanitizeGitErrorMessage(rawStderr);

    expect(sanitized).not.toContain("/home/runner");
    expect(sanitized).toContain("<redacted-path>");
  });
});
