import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resources = path.join(root, "apps/desktop/src-tauri/resources");
const forbidden: string[] = [];

function walk(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/(?:\.db|\.db-wal|\.db-shm|\.bak)$/i.test(entry.name)) forbidden.push(absolute);
  }
}

walk(resources);
if (forbidden.length > 0) {
  throw new Error(`Tauri resource verification failed; database artifacts found:\n${forbidden.join("\n")}`);
}
console.log("Bundled resources contain no database or migration-backup artifacts.");
