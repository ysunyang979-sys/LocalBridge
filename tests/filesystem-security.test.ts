import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { createLogger } from "@localbridge/shared";

describe("Filesystem Security and Sandboxing (Phase 5)", () => {
  let tmpDir: string;
  let projectRoot: string;
  let outsideDir: string;
  let fsService: FilesystemService;
  let projectRegistry: ProjectRegistry;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-fs-sec-test-"));
    projectRoot = path.join(tmpDir, "target-project");
    outsideDir = path.join(tmpDir, "outside-secret");

    fs.mkdirSync(path.join(projectRoot, "src", "sub"), { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    fs.writeFileSync(path.join(outsideDir, "secret.txt"), "super-secret-outside-content");
    fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), "console.log('safe content');");
    fs.writeFileSync(path.join(projectRoot, ".env"), "API_KEY=leak-me-not");
    fs.writeFileSync(path.join(projectRoot, "id_rsa"), "PRIVATE KEY");

    const logger = createLogger({ level: "silent", pretty: false, enabled: false });
    const projectsPath = path.join(tmpDir, "projects.json");
    projectRegistry = new ProjectRegistry(projectsPath, logger);
    const added = projectRegistry.add(projectRoot, { name: "test-project" });
    projectId = added.id;

    fsService = new FilesystemService(projectRegistry, logger);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("Path Traversal and Sandboxing", () => {
    it("rejects ../ traversal attempts across all operations", async () => {
      await expect(
        fsService.listDirectory({ projectId, path: "../" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_TRAVERSAL });

      await expect(
        fsService.stat({ projectId, path: "src/../../outside-secret/secret.txt" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_TRAVERSAL });

      await expect(
        fsService.readText({ projectId, path: "../outside-secret/secret.txt" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_TRAVERSAL });
    });

    it("rejects ..\\ traversal attempts across all operations", async () => {
      await expect(
        fsService.listDirectory({ projectId, path: "..\\" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_TRAVERSAL });

      await expect(
        fsService.stat({ projectId, path: "src\\..\\..\\outside-secret\\secret.txt" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_TRAVERSAL });

      await expect(
        fsService.readText({ projectId, path: "..\\outside-secret\\secret.txt" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_TRAVERSAL });
    });

    it("rejects mixed separator traversal attempts", async () => {
      await expect(
        fsService.readText({ projectId, path: "src/sub/..\\..\\../outside-secret/secret.txt" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_TRAVERSAL });
    });

    it("rejects absolute paths", async () => {
      const absPath = process.platform === "win32" ? "C:\\Windows\\System32" : "/etc/passwd";
      await expect(
        fsService.stat({ projectId, path: absPath })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_TRAVERSAL });

      await expect(
        fsService.readText({ projectId, path: absPath })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_TRAVERSAL });
    });

    it("rejects UNC network paths", async () => {
      await expect(
        fsService.readText({ projectId, path: "\\\\127.0.0.1\\c$\\secret.txt" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_UNC_NOT_ALLOWED });

      await expect(
        fsService.stat({ projectId, path: "//127.0.0.1/c$/secret.txt" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_UNC_NOT_ALLOWED });
    });

    it("rejects NT device namespaces", async () => {
      await expect(
        fsService.readText({ projectId, path: "\\\\?\\C:\\boot.ini" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_DEVICE_NOT_ALLOWED });

      await expect(
        fsService.stat({ projectId, path: "\\\\.\\PhysicalDrive0" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_DEVICE_NOT_ALLOWED });
    });

    it("rejects NTFS Alternate Data Streams (ADS)", async () => {
      await expect(
        fsService.readText({ projectId, path: "src/index.ts:stream" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_ADS_NOT_ALLOWED });

      await expect(
        fsService.stat({ projectId, path: "src/index.ts:$DATA" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_ADS_NOT_ALLOWED });
    });

    it("rejects Windows reserved device names", async () => {
      const reserved = ["CON", "aux", "NUL", "com1", "lpt1"];
      for (const name of reserved) {
        await expect(
          fsService.stat({ projectId, path: name })
        ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME });

        await expect(
          fsService.readText({ projectId, path: `src/${name}.txt` })
        ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME });
      }
    });

    it("rejects trailing dots and spaces", async () => {
      await expect(
        fsService.stat({ projectId, path: "src/index.ts." })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME });

      await expect(
        fsService.readText({ projectId, path: "src/index.ts " })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME });
    });

    it("rejects null byte injection", async () => {
      await expect(
        fsService.readText({ projectId, path: "src/index.ts\0.png" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_TRAVERSAL });
    });
  });

  describe("TOCTOU Symlink Mutation Protection", () => {
    it("blocks reading and stat when symlink is mutated to point outside project root", async () => {
      const symlinkFile = path.join(projectRoot, "src", "link_to_index.ts");
      const targetFile = path.join(projectRoot, "src", "index.ts");

      try {
        fs.symlinkSync(targetFile, symlinkFile, "file");
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "EPERM") {
          return;
        }
        throw err;
      }

      const initialRead = await fsService.readText({ projectId, path: "src/link_to_index.ts" });
      expect(initialRead.lines[0]?.text).toBe("console.log('safe content');");

      fs.unlinkSync(symlinkFile);
      fs.symlinkSync(path.join(outsideDir, "secret.txt"), symlinkFile, "file");

      await expect(
        fsService.readText({ projectId, path: "src/link_to_index.ts" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_SYMLINK_ESCAPE });

      await expect(
        fsService.stat({ projectId, path: "src/link_to_index.ts" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.PATH_SYMLINK_ESCAPE });
    });
  });

  describe("Sensitive File Blocking", () => {
    it("blocks file.stat and file.read on sensitive files", async () => {
      await expect(
        fsService.stat({ projectId, path: ".env" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED });

      await expect(
        fsService.readText({ projectId, path: ".env" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED });

      await expect(
        fsService.readText({ projectId, path: "id_rsa" })
      ).rejects.toMatchObject({ code: LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED });
    });

    it("filters out sensitive files during directory.list and flags sensitiveEntriesFiltered", async () => {
      const list = await fsService.listDirectory({ projectId, path: "." });
      expect(list.sensitiveEntriesFiltered).toBe(true);

      const names = list.entries.map((e) => e.name);
      expect(names).toContain("src");
      expect(names).not.toContain(".env");
      expect(names).not.toContain("id_rsa");
    });
  });

  describe("Host Machine Privacy Serialization", () => {
    it("guarantees zero host machine physical path leakage in serialized results", async () => {
      const dirList = await fsService.listDirectory({ projectId, path: "." });
      const statRes = await fsService.stat({ projectId, path: "src/index.ts" });
      const readRes = await fsService.readText({ projectId, path: "src/index.ts" });

      const outputs = [
        JSON.stringify(dirList),
        JSON.stringify(statRes),
        JSON.stringify(readRes),
      ];

      const sensitiveStrings = [
        tmpDir,
        projectRoot,
        outsideDir,
        fs.realpathSync.native(projectRoot),
        fs.realpathSync.native(tmpDir),
        os.homedir(),
      ];

      for (const json of outputs) {
        for (const secret of sensitiveStrings) {
          if (secret && secret.length > 3) {
            expect(json.includes(secret)).toBe(false);
            const fwd = secret.replaceAll("\\", "/");
            expect(json.includes(fwd)).toBe(false);
          }
        }
      }
    });
  });
});
