import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  resolveProjectPath,
  SecurityPathError,
  assertNoWindowsDevNamespace,
  assertNoDriveOrRootRelative,
  assertNoNtfsAds,
  assertNoWindowsReservedNames,
  assertNoTrailingDotsOrSpaces,
} from "@localbridge/security";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("Security Path Sandbox", () => {
  let tmpDir: string;
  let projectRoot: string;
  let canonicalRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-sandbox-test-"));
    projectRoot = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), "console.log('hi');");
    canonicalRoot = fs.realpathSync.native(projectRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("resolves valid relative paths inside canonicalRoot", () => {
    const res = resolveProjectPath(canonicalRoot, "src/index.ts");
    expect(res.canonicalPath).toBe(fs.realpathSync.native(path.join(projectRoot, "src", "index.ts")));
    expect(res.relativePath).toBe("src/index.ts");
  });

  it("rejects ../ traversal with PATH_TRAVERSAL", () => {
    expect(() => resolveProjectPath(canonicalRoot, "../secret.txt")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );

    expect(() => resolveProjectPath(canonicalRoot, "src/../../secret.txt")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );
  });

  it("rejects ..\\ traversal with PATH_TRAVERSAL", () => {
    expect(() => resolveProjectPath(canonicalRoot, "..\\secret.txt")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );

    expect(() => resolveProjectPath(canonicalRoot, "src\\..\\..\\secret.txt")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );
  });

  it("rejects mixed separators traversal a/b/../../.. with PATH_TRAVERSAL", () => {
    expect(() => resolveProjectPath(canonicalRoot, "src/sub/..\\..\\..\\etc\\passwd")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );
  });

  it("rejects absolute paths with PATH_TRAVERSAL", () => {
    const absPath = process.platform === "win32" ? "C:\\Windows\\System32" : "/etc/passwd";
    expect(() => resolveProjectPath(canonicalRoot, absPath)).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );
  });

  it("rejects drive-relative paths (e.g. C:foo.txt)", () => {
    expect(() => resolveProjectPath(canonicalRoot, "C:foo.txt")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );
  });

  it("rejects root-relative paths (e.g. \\foo.txt or /foo.txt)", () => {
    expect(() => resolveProjectPath(canonicalRoot, "\\foo.txt")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );
    expect(() => resolveProjectPath(canonicalRoot, "/foo.txt")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );
  });

  it("rejects UNC paths (\\\\server\\share) with PATH_UNC_NOT_ALLOWED", () => {
    expect(() => resolveProjectPath(canonicalRoot, "\\\\server\\share\\foo")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_UNC_NOT_ALLOWED })
    );
    expect(() => resolveProjectPath(canonicalRoot, "//server/share/foo")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_UNC_NOT_ALLOWED })
    );
  });

  it("rejects NT device namespaces (\\\\?\\ and \\\\.\\) with PATH_DEVICE_NOT_ALLOWED", () => {
    expect(() => resolveProjectPath(canonicalRoot, "\\\\?\\C:\\foo")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_DEVICE_NOT_ALLOWED })
    );
    expect(() => resolveProjectPath(canonicalRoot, "\\\\.\\PhysicalDrive0")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_DEVICE_NOT_ALLOWED })
    );
  });

  it("rejects null byte injection with PATH_TRAVERSAL", () => {
    expect(() => resolveProjectPath(canonicalRoot, "foo.txt\0.js")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );
  });

  it("prevents prefix confusion attacks (C:\\Project vs C:\\Project-Evil)", () => {
    // Create an evil directory sharing the same name prefix as projectRoot
    const evilDir = projectRoot + "-evil";
    fs.mkdirSync(evilDir, { recursive: true });
    fs.writeFileSync(path.join(evilDir, "hacked.txt"), "evil");

    try {
      // Trying to access sibling by relative traversal or confusion
      expect(() =>
        resolveProjectPath(canonicalRoot, `../${path.basename(projectRoot)}-evil/hacked.txt`)
      ).toThrowError(expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL }));
    } finally {
      fs.rmSync(evilDir, { recursive: true, force: true });
    }
  });

  it("rejects NTFS Alternate Data Streams (ADS) with PATH_ADS_NOT_ALLOWED", () => {
    expect(() => resolveProjectPath(canonicalRoot, "file.txt:stream")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_ADS_NOT_ALLOWED })
    );
    expect(() => resolveProjectPath(canonicalRoot, "file.txt:$DATA")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_ADS_NOT_ALLOWED })
    );
  });

  it("rejects Windows reserved device names with PATH_INVALID_WINDOWS_NAME", () => {
    const reserved = ["CON", "prn", "AUX", "NUL", "COM1", "com9", "LPT1", "lpt5"];
    for (const name of reserved) {
      expect(() => resolveProjectPath(canonicalRoot, name)).toThrowError(
        expect.objectContaining({ code: LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME })
      );
      expect(() => resolveProjectPath(canonicalRoot, `${name}.txt`)).toThrowError(
        expect.objectContaining({ code: LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME })
      );
      expect(() => resolveProjectPath(canonicalRoot, `src/${name}.ts`)).toThrowError(
        expect.objectContaining({ code: LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME })
      );
    }
  });

  it("rejects trailing dots and spaces with PATH_INVALID_WINDOWS_NAME", () => {
    expect(() => resolveProjectPath(canonicalRoot, "foo.txt.")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME })
    );
    expect(() => resolveProjectPath(canonicalRoot, "foo.txt ")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME })
    );
    expect(() => resolveProjectPath(canonicalRoot, "src/folder./index.ts")).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME })
    );
  });

  it("resolves non-existent deep paths when parent exists", () => {
    const res = resolveProjectPath(canonicalRoot, "src/components/button.tsx", {
      mustExist: false,
    });
    expect(res.relativePath).toBe("src/components/button.tsx");
    expect(res.absolutePath).toBe(path.join(canonicalRoot, "src", "components", "button.tsx"));
  });

  it("resolves non-existent deep paths when ancestors do not exist by walking up to nearest existing directory", () => {
    const deepTarget = "non/existent/deep/dir/nested/file.txt";
    const res = resolveProjectPath(canonicalRoot, deepTarget, { mustExist: false });
    expect(res.relativePath).toBe("non/existent/deep/dir/nested/file.txt");
  });

  it("rejects non-existent paths that attempt to escape via internal .. traversal", () => {
    expect(() =>
      resolveProjectPath(canonicalRoot, "deep/new/dir/../../../../outside.txt")
    ).toThrowError(expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL }));
  });
});
