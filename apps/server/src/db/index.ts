import fs from "node:fs";
import Database from "better-sqlite3";
import path from "node:path";
import { resolveDefaultMigrationsDir, runMigrations, type MigrationResult } from "./migrate.js";

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

  const existedBeforeOpen = resolvedPath !== ":memory:" && fs.existsSync(resolvedPath);
  const db = new Database(resolvedPath);
  let backupPath: string | undefined;
  const migrationDirectory = migrationsDir ?? resolveDefaultMigrationsDir();
  const latestMigrationVersion = fs.existsSync(migrationDirectory)
    ? Math.max(0, ...fs.readdirSync(migrationDirectory).map((name) => Number(name.match(/^(\d+)_/)?.[1] ?? 0)))
    : 0;

  // A byte-for-byte copy is unsafe while SQLite is in WAL mode. VACUUM INTO
  // asks SQLite itself to produce a transactionally consistent snapshot that
  // includes committed WAL content. Any backup or validation failure is fatal:
  // migrations must never run without a verified recovery point.
  if (existedBeforeOpen) {
    try {
      let currentVersion = 0;
      const hasMigrationTable = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        .get();
      if (hasMigrationTable) {
        const row = db
          .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
          .get() as { version: number };
        currentVersion = row.version;
      }
      if (currentVersion < latestMigrationVersion) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        backupPath = `${resolvedPath}.pre-migration-v${currentVersion}-${stamp}-${process.pid}.bak`;
        const escaped = backupPath.replace(/'/g, "''");
        db.exec(`VACUUM INTO '${escaped}'`);

        const backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
        try {
          const rows = backupDb.pragma("integrity_check") as Array<{ integrity_check: string }>;
          if (rows.length !== 1 || rows[0]?.integrity_check !== "ok") {
            throw new Error("SQLite backup integrity_check failed");
          }
        } finally {
          backupDb.close();
        }
      }
    } catch (error) {
      db.close();
      throw new Error(
        `Cannot create a verified pre-migration SQLite backup: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Performance and safety pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  const migrationResult = runMigrations(db, migrationDirectory);

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
export * from "./connection-service.js";
