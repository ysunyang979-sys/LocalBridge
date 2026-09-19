import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { BackupMetadata, BackupOperationType } from "./types.js";

export const MAX_BACKUPS_PER_PROJECT = 100;
export const MAX_BACKUP_BYTES_PER_PROJECT = 100 * 1024 * 1024; // 100 MiB

export class BackupService {
  constructor(
    private readonly baseDir: string,
    private readonly logger?: Logger
  ) {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Returns the base directory for backups.
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Generates a unique operation ID.
   */
  generateOperationId(): string {
    return `op_${crypto.randomUUID()}`;
  }

  /**
   * Get the directory for a specific backup operation.
   */
  private getBackupDir(projectId: string, operationId: string): string {
    return path.join(this.baseDir, projectId, operationId);
  }

  /**
   * Create a backup for an existing file before modification or deletion.
   */
  createBackup(params: {
    operationId: string;
    projectId: string;
    relativePath: string;
    operation: BackupOperationType;
    oldContent: Buffer;
    oldHash: string;
    newHash: string | null;
    mode: number;
  }): BackupMetadata {
    const { operationId, projectId, relativePath, operation, oldContent, oldHash, newHash, mode } = params;
    const backupDir = this.getBackupDir(projectId, operationId);

    // Enforce limits before writing new backup
    this.enforceRetention(projectId, oldContent.length);

    fs.mkdirSync(backupDir, { recursive: true });

    const metadata: BackupMetadata = {
      operationId,
      projectId,
      relativePath,
      operation,
      createdAt: Date.now(),
      oldHash,
      newHash,
      size: oldContent.length,
      mode,
    };

    fs.writeFileSync(path.join(backupDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");
    fs.writeFileSync(path.join(backupDir, "content"), oldContent);

    this.logger?.info(
      {
        event: "backup_created",
        operationId,
        projectId,
        relativePath,
        operation,
        size: oldContent.length,
      },
      `Backup created for ${relativePath} (${operation})`
    );

    return metadata;
  }

  /**
   * Retrieve a backup by projectId and operationId.
   */
  getBackup(projectId: string, operationId: string): { metadata: BackupMetadata; content: Buffer } {
    const backupDir = this.getBackupDir(projectId, operationId);
    const metaPath = path.join(backupDir, "metadata.json");
    const contentPath = path.join(backupDir, "content");

    if (!fs.existsSync(metaPath) || !fs.existsSync(contentPath)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.BACKUP_NOT_FOUND,
        `Backup for operation "${operationId}" not found`
      );
    }

    try {
      const metaJson = fs.readFileSync(metaPath, "utf-8");
      const metadata = JSON.parse(metaJson) as BackupMetadata;
      const content = fs.readFileSync(contentPath);
      return { metadata, content };
    } catch (err) {
      if (err instanceof LocalBridgeError) throw err;
      throw new LocalBridgeError(
        LocalBridgeErrorCode.BACKUP_NOT_FOUND,
        `Backup for operation "${operationId}" could not be read: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Enforces retention policy for a project: max 100 backups and max 100 MiB total size.
   * Evicts oldest backups (FIFO based on createdAt) if necessary.
   */
  private enforceRetention(projectId: string, incomingBytes: number): void {
    const projectBackupDir = path.join(this.baseDir, projectId);
    if (!fs.existsSync(projectBackupDir)) {
      return;
    }

    const entries = fs.readdirSync(projectBackupDir, { withFileTypes: true });
    const backups: { id: string; dir: string; createdAt: number; size: number }[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const bDir = path.join(projectBackupDir, entry.name);
      const mPath = path.join(bDir, "metadata.json");
      const cPath = path.join(bDir, "content");

      if (fs.existsSync(mPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(mPath, "utf-8")) as BackupMetadata;
          backups.push({
            id: entry.name,
            dir: bDir,
            createdAt: meta.createdAt || 0,
            size: meta.size || (fs.existsSync(cPath) ? fs.statSync(cPath).size : 0),
          });
        } catch {
          const stat = fs.statSync(bDir);
          backups.push({
            id: entry.name,
            dir: bDir,
            createdAt: stat.birthtimeMs || stat.mtimeMs,
            size: fs.existsSync(cPath) ? fs.statSync(cPath).size : 0,
          });
        }
      }
    }

    backups.sort((a, b) => a.createdAt - b.createdAt);

    let totalSize = backups.reduce((acc, b) => acc + b.size, 0);

    while (
      backups.length > 0 &&
      (backups.length >= MAX_BACKUPS_PER_PROJECT || totalSize + incomingBytes > MAX_BACKUP_BYTES_PER_PROJECT)
    ) {
      const oldest = backups.shift()!;
      try {
        fs.rmSync(oldest.dir, { recursive: true, force: true });
        totalSize -= oldest.size;
        this.logger?.info(
          {
            event: "backup_evicted",
            projectId,
            operationId: oldest.id,
            freedBytes: oldest.size,
          },
          `Evicted old backup ${oldest.id} for project ${projectId}`
        );
      } catch (e) {
        this.logger?.warn(`Failed to evict old backup at ${oldest.dir}: ${e}`);
        break;
      }
    }
  }

  /**
   * Run backup retention cleanup across all projects on runner startup.
   */
  cleanupAllProjects(): void {
    if (!fs.existsSync(this.baseDir)) return;
    try {
      const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          this.enforceRetention(entry.name, 0);
        }
      }
    } catch (e) {
      this.logger?.warn(`Backup retention cleanup encountered error: ${e}`);
    }
  }
}

