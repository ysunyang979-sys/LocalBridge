import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations, type MigrationResult } from "./migrate.js";

export interface DatabaseConnection {
  db: Database.Database;
  migrationResult: MigrationResult;
  close: () => void;
}



export function initDatabase(
  dbPath: string = "localbridge.db",
  migrationsDir?: string
): DatabaseConnection {
  const resolvedPath = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);

  const db = new Database(resolvedPath);

  // Performance and safety pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  const migrationResult = runMigrations(db, migrationsDir);

  return {
    db,
    migrationResult,
    close: () => {
      if (db.open) {
        db.close();
      }
    },
  };
}

export * from "./schema.js";
export * from "./migrate.js";
