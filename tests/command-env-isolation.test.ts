import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildSafeProcessEnv } from "../apps/runner/src/process/environment.js";

describe("Phase 8 - Command Environment Isolation & Sanitization", () => {
  let tempStateDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-env-test-"));

    // Inject simulated sensitive variables into host process.env
    process.env.OPENAI_API_KEY = "sk-proj-supersecret123";
    process.env.ANTHROPIC_API_KEY = "sk-ant-topsecret456";
    process.env.AWS_SECRET_ACCESS_KEY = "aws-secret-key-789";
    process.env.GITHUB_TOKEN = "ghp_randomtokenabc";
    process.env.LOCALBRIDGE_SERVER_SECRET = "lb-secret-xyz";
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    try {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("strips all parent environment secrets from child environment", () => {
    const safeEnv = buildSafeProcessEnv(tempStateDir);

    expect(safeEnv.OPENAI_API_KEY).toBeUndefined();
    expect(safeEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(safeEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(safeEnv.GITHUB_TOKEN).toBeUndefined();
    expect(safeEnv.LOCALBRIDGE_SERVER_SECRET).toBeUndefined();
  });

  it("redirects HOME, USERPROFILE, and XDG directories to isolated execution-home", () => {
    const safeEnv = buildSafeProcessEnv(tempStateDir);
    const expectedHome = path.join(tempStateDir, "execution-home");

    expect(safeEnv.HOME).toBe(expectedHome);
    expect(safeEnv.USERPROFILE).toBe(expectedHome);
    expect(safeEnv.XDG_CONFIG_HOME).toBe(path.join(expectedHome, ".config"));
    expect(safeEnv.XDG_DATA_HOME).toBe(path.join(expectedHome, ".local", "share"));
    expect(safeEnv.XDG_CACHE_HOME).toBe(path.join(expectedHome, ".cache"));
    expect(safeEnv.NPM_CONFIG_USERCONFIG).toBe(path.join(expectedHome, ".npmrc"));

    // Verifies execution-home directory was automatically created
    expect(fs.existsSync(expectedHome)).toBe(true);
  });

  it("sets PYTHONNOUSERSITE=1 to prevent loading untrusted local site packages", () => {
    const safeEnv = buildSafeProcessEnv(tempStateDir);
    expect(safeEnv.PYTHONNOUSERSITE).toBe("1");
  });

  it("preserves required system execution variables like PATH", () => {
    const safeEnv = buildSafeProcessEnv(tempStateDir);
    expect(safeEnv.PATH).toBeDefined();
    if (process.platform === "win32") {
      expect(safeEnv.SystemRoot || safeEnv.SYSTEMROOT || safeEnv.WINDIR).toBeDefined();
    }
  });
});
