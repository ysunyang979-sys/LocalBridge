import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ProjectStateFile } from "./types.js";

/**
 * Loads project state from disk.
 * If the file does not exist, returns an empty initial state.
 */
export function loadProjectsState(filePath: string): ProjectStateFile {
  if (!fs.existsSync(filePath)) {
    return { version: 1, projects: [] };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ProjectStateFile>;
    if (parsed && Array.isArray(parsed.projects)) {
      return {
        version: 1,
        projects: parsed.projects.map((p) => ({
          ...p,
          accessMode: p.accessMode === "read-write" ? "read-write" : "read-only",
          executionMode:
            p.executionMode === "safe-only" || p.executionMode === "project-code"
              ? p.executionMode
              : "disabled",
        })),
      };
    }
    return { version: 1, projects: [] };
  } catch {
    return { version: 1, projects: [] };
  }
}

/**
 * Atomically writes project state to disk:
 * 1. Serializes to JSON
 * 2. Writes to temporary file in the same directory
 * 3. Flushes to disk via fsync
 * 4. Atomically renames temporary file to target path
 */
export function saveProjectsState(filePath: string, state: ProjectStateFile): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempFile = path.join(
    dir,
    `.projects_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.tmp`
  );

  const payload = JSON.stringify(state, null, 2);

  // Write and fsync temporary file
  const fd = fs.openSync(tempFile, "w", 0o600);
  try {
    fs.writeFileSync(fd, payload, "utf-8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Atomic rename
  fs.renameSync(tempFile, filePath);
}
