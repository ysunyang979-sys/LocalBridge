import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("file.read RPC & Filesystem Service", () => {
  let tmpDir: string;
  let projectsFile: string;
  let projectDir: string;
  let registry: ProjectRegistry;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-file-read-test-"));
    projectsFile = path.join(tmpDir, "projects.json");
    projectDir = path.join(tmpDir, "read-app");

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });

    registry = new ProjectRegistry(projectsFile);
    const added = registry.add(projectDir, { name: "read-app" });
    projectId = added.id;

    fsService = new FilesystemService(registry);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads normal UTF-8 text file with line numbers", async () => {
    const filePath = path.join(projectDir, "hello.txt");
    fs.writeFileSync(filePath, "line 1\nline 2\nline 3\n", "utf-8");

    const res = await fsService.readText({
      projectId,
      path: "hello.txt",
    });

    expect(res.projectId).toBe(projectId);
    expect(res.path).toBe("hello.txt");
    expect(res.encoding).toBe("utf-8");
    expect(res.startLine).toBe(1);
    expect(res.endLine).toBe(4);
    expect(res.nextLine).toBeNull();
    expect(res.truncated).toBe(false);
    expect(res.lines).toEqual([
      { line: 1, text: "line 1" },
      { line: 2, text: "line 2" },
      { line: 3, text: "line 3" },
      { line: 4, text: "" },
    ]);
  });

  it("reads Chinese UTF-8 content and multi-byte characters", async () => {
    const filePath = path.join(projectDir, "chinese.txt");
    const content = "你好，世界！\n这是本地桥接服务。\n测试UTF-8中文字符编码。";
    fs.writeFileSync(filePath, content, "utf-8");

    const res = await fsService.readText({
      projectId,
      path: "chinese.txt",
    });

    expect(res.lines).toHaveLength(3);
    expect(res.lines[0]?.text).toBe("你好，世界！");
    expect(res.lines[1]?.text).toBe("这是本地桥接服务。");
    expect(res.lines[2]?.text).toBe("测试UTF-8中文字符编码。");
  });

  it("reads text containing Emoji correctly", async () => {
    const filePath = path.join(projectDir, "emoji.txt");
    fs.writeFileSync(filePath, "🚀 Launching LocalBridge!\n🛡️ Security sandboxed.", "utf-8");

    const res = await fsService.readText({
      projectId,
      path: "emoji.txt",
    });

    expect(res.lines).toHaveLength(2);
    expect(res.lines[0]?.text).toBe("🚀 Launching LocalBridge!");
    expect(res.lines[1]?.text).toBe("🛡️ Security sandboxed.");
  });

  it("handles and strips UTF-8 BOM cleanly", async () => {
    const filePath = path.join(projectDir, "bom.txt");
    const bomBuffer = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]), // UTF-8 BOM
      Buffer.from("Hello with BOM", "utf-8"),
    ]);
    fs.writeFileSync(filePath, bomBuffer);

    const res = await fsService.readText({
      projectId,
      path: "bom.txt",
    });

    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]?.text).toBe("Hello with BOM");
    expect(res.lines[0]?.text.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("supports startLine and maxLines pagination", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n");
    fs.writeFileSync(path.join(projectDir, "paged.txt"), lines, "utf-8");

    // Page 1: lines 1 to 5
    const page1 = await fsService.readText({
      projectId,
      path: "paged.txt",
      startLine: 1,
      maxLines: 5,
    });

    expect(page1.startLine).toBe(1);
    expect(page1.endLine).toBe(5);
    expect(page1.nextLine).toBe(6);
    expect(page1.lines).toHaveLength(5);
    expect(page1.lines[0]?.line).toBe(1);
    expect(page1.lines[4]?.line).toBe(5);

    // Page 2: lines 6 to 10
    const page2 = await fsService.readText({
      projectId,
      path: "paged.txt",
      startLine: page1.nextLine!,
      maxLines: 5,
    });

    expect(page2.startLine).toBe(6);
    expect(page2.endLine).toBe(10);
    expect(page2.nextLine).toBe(11);
    expect(page2.lines[0]?.line).toBe(6);
    expect(page2.lines[4]?.line).toBe(10);

    // Last Page: line 16 to 20
    const lastPage = await fsService.readText({
      projectId,
      path: "paged.txt",
      startLine: 16,
      maxLines: 10,
    });

    expect(lastPage.startLine).toBe(16);
    expect(lastPage.endLine).toBe(20);
    expect(lastPage.nextLine).toBeNull();
    expect(lastPage.lines).toHaveLength(5);
  });

  it("truncates and sets nextLine when content exceeds 128 KiB limit", async () => {
    // 300 lines of 500 bytes each = ~150 KiB total content
    const singleLine = "a".repeat(500);
    const bigContent = Array.from({ length: 300 }, () => singleLine).join("\n");
    fs.writeFileSync(path.join(projectDir, "big-lines.txt"), bigContent, "utf-8");

    const res = await fsService.readText({
      projectId,
      path: "big-lines.txt",
      startLine: 1,
      maxLines: 300,
    });

    expect(res.truncated).toBe(true);
    expect(res.nextLine).toBeGreaterThan(1);
    expect(res.lines.length).toBeLessThan(300);

    // Calculate returned content bytes
    const totalBytes = res.lines.reduce(
      (sum, l) => sum + Buffer.byteLength(l.text, "utf-8"),
      0
    );
    expect(totalBytes).toBeLessThanOrEqual(131072);
  });

  it("rejects files larger than 8 MiB with FILE_TOO_LARGE", () => {
    const hugeFilePath = path.join(projectDir, "huge.txt");
    // Create an 8.5 MiB sparse/zero file
    const fd = fs.openSync(hugeFilePath, "w");
    fs.ftruncateSync(fd, 8.5 * 1024 * 1024);
    fs.closeSync(fd);

    return expect(
      fsService.readText({
        projectId,
        path: "huge.txt",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.FILE_TOO_LARGE })
    );
  });

  it("handles empty files cleanly", async () => {
    fs.writeFileSync(path.join(projectDir, "empty.txt"), "");

    const res = await fsService.readText({
      projectId,
      path: "empty.txt",
    });

    expect(res.lines).toEqual([]);
    expect(res.startLine).toBe(1);
    expect(res.endLine).toBe(0);
    expect(res.nextLine).toBeNull();
    expect(res.truncated).toBe(false);
  });

  it("throws FILE_NOT_FOUND when file does not exist", async () => {
    await expect(
      fsService.readText({
        projectId,
        path: "missing.txt",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.FILE_NOT_FOUND })
    );
  });

  it("throws FILE_NOT_REGULAR when target is a directory", async () => {
    await expect(
      fsService.readText({
        projectId,
        path: "src",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.FILE_NOT_REGULAR })
    );
  });

  it("detects binary files containing NUL byte and throws BINARY_FILE", async () => {
    const binPath = path.join(projectDir, "test.bin");
    const buf = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f, 0x72, 0x6c, 0x64]);
    fs.writeFileSync(binPath, buf);

    await expect(
      fsService.readText({
        projectId,
        path: "test.bin",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.BINARY_FILE })
    );
  });

  it("rejects invalid non-UTF-8 files with FILE_ENCODING_UNSUPPORTED", async () => {
    const invalidUtf8Path = path.join(projectDir, "invalid-utf8.txt");
    // 0xC0 and 0xAF are invalid UTF-8 overlong sequences
    const invalidBuf = Buffer.from([0xc0, 0xaf, 0xff, 0xfe]);
    fs.writeFileSync(invalidUtf8Path, invalidBuf);

    await expect(
      fsService.readText({
        projectId,
        path: "invalid-utf8.txt",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.FILE_ENCODING_UNSUPPORTED })
    );
  });

  it("rejects single line exceeding 128 KiB with FILE_LINE_TOO_LONG", async () => {
    const hugeLinePath = path.join(projectDir, "huge-line.txt");
    // Single line > 130 KiB
    const longLine = "x".repeat(135000);
    fs.writeFileSync(hugeLinePath, longLine);

    await expect(
      fsService.readText({
        projectId,
        path: "huge-line.txt",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.FILE_LINE_TOO_LONG })
    );
  });

  it("blocks sensitive files with SENSITIVE_FILE_BLOCKED", async () => {
    fs.writeFileSync(path.join(projectDir, ".env"), "SECRET=xyz");

    await expect(
      fsService.readText({
        projectId,
        path: ".env",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED })
    );
  });

  it("blocks reading when project is disabled with PROJECT_DISABLED", async () => {
    fs.writeFileSync(path.join(projectDir, "index.ts"), "code");
    registry.disable(projectId);

    await expect(
      fsService.readText({
        projectId,
        path: "index.ts",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_DISABLED })
    );
  });

  it("strictly enforces read-only: no write APIs exist on FilesystemService", () => {
    const serviceAny = fsService as Record<string, unknown>;
    expect(serviceAny.write).toBeUndefined();
    expect(serviceAny.writeFile).toBeUndefined();
    expect(serviceAny.create).toBeUndefined();
    expect(serviceAny.delete).toBeUndefined();
    expect(serviceAny.patch).toBeUndefined();
    expect(serviceAny.rename).toBeUndefined();
    expect(serviceAny.mkdir).toBeUndefined();
  });
});
