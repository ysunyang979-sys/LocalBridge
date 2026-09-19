import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BackupService } from "../apps/runner/src/backup/service.js";

describe("backup identifier and metadata integrity", () => {
  let dir: string;
  let service: BackupService;
  let operationId: string;
  const projectId = "proj_test";

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-backup-integrity-"));
    service = new BackupService(dir);
    operationId = service.generateOperationId();
    const content = Buffer.from("trusted");
    const hash = `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
    service.createBackup({ operationId, projectId, relativePath: "a.txt", operation: "delete", oldContent: content, oldHash: hash, newHash: null, mode: 0o644 });
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it.each(["../escape", "..\\escape", "op_bad/id", "op_bad:id"])("rejects unsafe operationId %s", (candidate) => {
    expect(() => service.getBackup(projectId, candidate)).toThrow();
  });

  it("rejects cross-project lookup", () => {
    expect(() => service.getBackup("proj_other", operationId)).toThrow();
  });

  it("rejects forged metadata and forged content", () => {
    const backupDir = path.join(dir, projectId, operationId);
    const metadataPath = path.join(backupDir, "metadata.json");
    const original = fs.readFileSync(metadataPath, "utf8");
    const forged = JSON.parse(original);
    forged.projectId = "proj_other";
    fs.writeFileSync(metadataPath, JSON.stringify(forged));
    expect(() => service.getBackup(projectId, operationId)).toThrow();

    fs.writeFileSync(metadataPath, original);
    fs.writeFileSync(path.join(backupDir, "content"), "tampered");
    expect(() => service.getBackup(projectId, operationId)).toThrow();
  });
});
