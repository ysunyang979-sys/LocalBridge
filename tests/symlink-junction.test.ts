import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveProjectPath } from "@localbridge/security";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("Symlink & Windows Junction Escaping Protection", () => {
  let tmpDir: string;
  let projectRoot: string;
  let canonicalRoot: string;
  let outsideDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-symlink-test-"));
    projectRoot = path.join(tmpDir, "project");
    outsideDir = path.join(tmpDir, "outside");

    fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    fs.writeFileSync(path.join(outsideDir, "secret.txt"), "top-secret-data");
    fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), "export const ok = true;");

    canonicalRoot = fs.realpathSync.native(projectRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("blocks directory junction pointing outside project with PATH_SYMLINK_ESCAPE", () => {
    const junctionPath = path.join(projectRoot, "outside_junction");
    try {
      fs.symlinkSync(outsideDir, junctionPath, "junction");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        // Skip if environment doesn't allow junction creation
        return;
      }
      throw err;
    }

    expect(() =>
      resolveProjectPath(canonicalRoot, "outside_junction/secret.txt")
    ).toThrowError(expect.objectContaining({ code: LocalBridgeErrorCode.PATH_SYMLINK_ESCAPE }));
  });

  it("blocks symlink pointing outside project with PATH_SYMLINK_ESCAPE", () => {
    const symlinkPath = path.join(projectRoot, "outside_link");
    try {
      fs.symlinkSync(
        outsideDir,
        symlinkPath,
        process.platform === "win32" ? "junction" : "dir"
      );
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }
      throw err;
    }

    expect(() =>
      resolveProjectPath(canonicalRoot, "outside_link/secret.txt")
    ).toThrowError(expect.objectContaining({ code: LocalBridgeErrorCode.PATH_SYMLINK_ESCAPE }));
  });

  it("allows symlink/junction pointing inside project root", () => {
    const internalTarget = path.join(projectRoot, "src");
    const internalLink = path.join(projectRoot, "internal_link");

    try {
      fs.symlinkSync(
        internalTarget,
        internalLink,
        process.platform === "win32" ? "junction" : "dir"
      );
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }
      throw err;
    }

    const res = resolveProjectPath(canonicalRoot, "internal_link/index.ts");
    expect(res.relativePath).toBe("src/index.ts");
    expect(res.canonicalPath).toBe(
      fs.realpathSync.native(path.join(projectRoot, "src", "index.ts"))
    );
  });

  it("handles non-existent target inside an escaping symlink directory", () => {
    const junctionPath = path.join(projectRoot, "escaping_dir");
    try {
      fs.symlinkSync(outsideDir, junctionPath, "junction");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }
      throw err;
    }

    expect(() =>
      resolveProjectPath(canonicalRoot, "escaping_dir/non-existent.txt", { mustExist: false })
    ).toThrowError(expect.objectContaining({ code: LocalBridgeErrorCode.PATH_SYMLINK_ESCAPE }));
  });
});
