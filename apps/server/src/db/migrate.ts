import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import type { MigrationRow } from "./schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrationResult {
  appliedCount: number;
  appliedMigrations: string[];
  currentVersion: number;
}

export function resolveDefaultMigrationsDir(): string {
  // 1. Check relative to current directory (e.g. src/db/migrations or dist/migrations)
  const candidate1 = path.resolve(__dirname, "migrations");
  if (fs.existsSync(candidate1)) return candidate1;

  // 2. Check from dist/ (dist/../src/db/migrations)
  const candidate2 = path.resolve(__dirname, "../src/db/migrations");
  if (fs.existsSync(candidate2)) return candidate2;

  // 3. Check from workspace root
  const candidate3 = path.resolve(process.cwd(), "apps/server/src/db/migrations");
  if (fs.existsSync(candidate3)) return candidate3;

  const candidate4 = path.resolve(process.cwd(), "src/db/migrations");
  if (fs.existsSync(candidate4)) return candidate4;

  return candidate1;
}

export function runMigrations(
  db: Database.Database,
  migrationsDir?: string
): MigrationResult {
  const dir = migrationsDir ?? resolveDefaultMigrationsDir();

  // 1. Initialize schema_migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  // 2. Fetch applied migrations
  const appliedRows = db
    .prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC")
    .all() as MigrationRow[];

  const appliedVersions = new Set(appliedRows.map((r) => r.version));
  let currentVersion = appliedRows.length > 0 ? appliedRows[appliedRows.length - 1]!.version : 0;

  // 3. Discover SQL migration files
  if (!fs.existsSync(dir)) {
    return { appliedCount: 0, appliedMigrations: [], currentVersion };
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedMigrations: string[] = [];

  for (const file of files) {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) continue;

    const version = Number.parseInt(match[1]!, 10);
    const name = match[2]!;

    if (appliedVersions.has(version)) {
      continue;
    }

    const filePath = path.join(dir, file);
    const sql = fs.readFileSync(filePath, "utf-8");

    // Execute migration atomically in a transaction
    const applyTx = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      ).run(version, name, Date.now());
    });

    applyTx();
    appliedMigrations.push(file);
    currentVersion = version;
  }

  return {
    appliedCount: appliedMigrations.length,
    appliedMigrations,
    currentVersion,
  };
}

export function getCurrentSchemaVersion(db: Database.Database): number {
  try {
    const row = db
      .prepare("SELECT MAX(version) as max_version FROM schema_migrations")
      .get() as { max_version: number | null } | undefined;
    return row?.max_version ?? 0;
  } catch {
    return 0;
  }
}
