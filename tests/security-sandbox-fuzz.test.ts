import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { resolveProjectPath, isPathInside, SecurityPathError } from "@localbridge/security";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("Phase 12 - Path Sandbox Fuzzing & Attack Neutralization", () => {
  let tmpDir: string;
  let projectRoot: string;
  let siblingDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-sandbox-fuzz-"));
    projectRoot = path.join(tmpDir, "target-project");
    siblingDir = path.join(tmpDir, "target-project-evil");

    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(siblingDir, { recursive: true });

    // Seed normal files in project root
    fs.writeFileSync(path.join(projectRoot, "app.ts"), "console.log('app');");
    fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), "export const x = 1;");

    // Seed file in sibling directory
    fs.writeFileSync(path.join(siblingDir, "secret.key"), "SUPER_SECRET_KEY");
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("neutralizes directory traversal attacks across all slash variations", () => {
    const traversalPayloads = [
      "../secret.key",
      "..\\secret.key",
      "..\\../secret.key",
      "../../secret.key",
      "..\\..\\secret.key",
      "src/../../secret.key",
      "src/..\\../secret.key",
      "src\\..\\..\\secret.key",
      "./../../secret.key",
      ".\\..\\..\\secret.key",
      ".../secret.key",
      "....//secret.key",
      "src/./../../secret.key",
      "src/../..",
    ];

    for (const payload of traversalPayloads) {
      expect(() => {
        resolveProjectPath(projectRoot, payload, { mustExist: false });
      }, `Payload "${payload}" should be rejected`).toThrow(SecurityPathError);
    }
  });

  it("neutralizes Windows device namespaces, reserved DOS names, and UNC paths", () => {
    const reservedAndUncPayloads = [
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "COM9",
      "LPT1",
      "LPT9",
      "CON.txt",
      "PRN.log",
      "NUL.dat",
      "\\\\?\\C:\\Windows\\System32",
      "\\\\.\\NUL",
      "\\\\server\\share\\file.txt",
      "//server/share/file.txt",
      "\\\\127.0.0.1\\c$\\secret.txt",
    ];

    for (const payload of reservedAndUncPayloads) {
      expect(() => {
        resolveProjectPath(projectRoot, payload, { mustExist: false });
      }, `Payload "${payload}" should be rejected`).toThrow(SecurityPathError);
    }
  });

  it("neutralizes NTFS Alternate Data Streams (ADS) and trailing dots/spaces", () => {
    const adsAndTrailingPayloads = [
      "app.ts:stream",
      "app.ts::$DATA",
      "src/index.ts:hidden",
      "test.txt:$INDEX_ALLOCATION",
      "app.ts.",
      "app.ts..",
      "app.ts   ",
      "src/index.ts. ",
      "src/index.ts .",
    ];

    for (const payload of adsAndTrailingPayloads) {
      expect(() => {
        resolveProjectPath(projectRoot, payload, { mustExist: false });
      }, `Payload "${payload}" should be rejected`).toThrow(SecurityPathError);
    }
  });

  it("neutralizes null byte injections and mixed Unicode separators", () => {
    const injectionPayloads = [
      "app.ts\0.js",
      "src/index.ts%00",
      "app.ts\u0000",
      "app.ts\uff0f..",
    ];

    for (const payload of injectionPayloads) {
      expect(() => {
        resolveProjectPath(projectRoot, payload, { mustExist: false });
      }, `Payload "${payload}" should be rejected`).toThrow(SecurityPathError);
    }
  });

  it("strictly blocks sibling prefix collision attacks (e.g. target-project-evil)", () => {
    // Attempting to resolve into target-project-evil from target-project
    expect(isPathInside(projectRoot, siblingDir)).toBe(false);
    expect(isPathInside(projectRoot, path.join(siblingDir, "secret.key"))).toBe(false);

    // Lexical relative resolution
    expect(() => {
      resolveProjectPath(projectRoot, "../target-project-evil/secret.key", { mustExist: false });
    }).toThrow(SecurityPathError);
  });

  it("safely resolves legitimate project files inside the sandbox", () => {
    const resolved = resolveProjectPath(projectRoot, "src/index.ts", { mustExist: true });
    expect(resolved.relativePath).toBe("src/index.ts");
    expect(isPathInside(projectRoot, resolved.canonicalPath)).toBe(true);
    expect(fs.existsSync(resolved.canonicalPath)).toBe(true);
  });
});
