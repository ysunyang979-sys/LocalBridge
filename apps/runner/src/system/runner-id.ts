import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export function resolveRunnerStatePath(): string {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "LocalBridge", "runner.json");
  }

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "LocalBridge", "runner.json");
  }

  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(configHome, "localbridge", "runner.json");
}

export function getOrCreateRunnerId(customStatePath?: string): string {
  const statePath = customStatePath ?? resolveRunnerStatePath();

  try {
    if (fs.existsSync(statePath)) {
      const content = fs.readFileSync(statePath, "utf-8");
      const parsed = JSON.parse(content) as { runnerId?: string };
      if (parsed.runnerId && typeof parsed.runnerId === "string") {
        return parsed.runnerId;
      }
    }
  } catch {
    // If state is corrupt, generate a fresh ID
  }

  const newId = `runner_${crypto.randomUUID()}`;

  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ runnerId: newId }, null, 2), "utf-8");
  } catch {
    // If state directory cannot be written, return generated ID in-memory
  }

  return newId;
}
