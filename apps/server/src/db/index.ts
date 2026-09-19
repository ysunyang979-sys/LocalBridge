import fs from "node:fs";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations, type MigrationResult } from "./migrate.js";

export interface DatabaseConnection {
  db: Database.Database;
  migrationResult: MigrationResult;
  backupPath?: string;
  close: () => void;
}

export function initDatabase(
  dbPath: string = "localbridge.db",
  migrationsDir?: string
): DatabaseConnection {
  const resolvedPath = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);

  let backupPath: string | undefined;

  // Pre-migration backup: preserve existing database file before migrations run
  if (resolvedPath !== ":memory:" && fs.existsSync(resolvedPath)) {
    try {
      backupPath = `${resolvedPath}.pre-migration.bak`;
      fs.copyFileSync(resolvedPath, backupPath);
    } catch {
      // Proceed if backup creation cannot complete
    }
  }

  const db = new Database(resolvedPath);

  // Performance and safety pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  const migrationResult = runMigrations(db, migrationsDir);

  return {
    db,
    migrationResult,
    backupPath,
    close: () => {
      if (db.open) {
        db.close();
      }
    },
  };
}

export * from "./schema.js";
export * from "./migrate.js";
