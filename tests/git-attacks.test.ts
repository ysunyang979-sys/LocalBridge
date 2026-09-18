import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import child_process from "node:child_process";
import { GitProcessRunner } from "../apps/runner/src/git/process.js";
import { GitService } from "../apps/runner/src/git/service.js";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { createLogger } from "@localbridge/shared";

describe("Git Security & Attack Neutralization (git-attacks)", () => {
  let tmpDir: string;
  let repoDir: string;
  let gitService: GitService;
  let projectId: string;
  let markerFile: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-git-attacks-"));
    repoDir = path.join(tmpDir, "attack-repo");
    markerFile = path.join(tmpDir, "pwned.marker");
    fs.mkdirSync(repoDir, { recursive: true });

    child_process.execFileSync("git", ["init"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.name", "Test Attacker"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.email", "attacker@example.com"], { cwd: repoDir });

    // Node script to create the marker file if executed
    const attackScript = path.join(tmpDir, "pwn.js").replace(/\\/g, "/");
    fs.writeFileSync(
      attackScript,
      `const fs = require('fs'); fs.writeFileSync('${markerFile.replace(/\\/g, "/")}', 'PWNED');`
    );

    // 1. Plant malicious diff.external into repository config
    child_process.execFileSync(
      "git",
      ["config", "diff.external", `node "${attackScript}"`],
      { cwd: repoDir }
    );

    // 2. Plant malicious textconv
    child_process.execFileSync(
      "git",
      ["config", "diff.custom.textconv", `node "${attackScript}"`],
      { cwd: repoDir }
    );

    // 3. Plant malicious fsmonitor
    child_process.execFileSync(
      "git",
      ["config", "core.fsmonitor", `node "${attackScript}"`],
      { cwd: repoDir }
    );

    // 4. Plant malicious hooksPath
    const maliciousHooksDir = path.join(tmpDir, "hooks");
    fs.mkdirSync(maliciousHooksDir, { recursive: true });
    child_process.execFileSync(
      "git",
      ["config", "core.hooksPath", maliciousHooksDir],
      { cwd: repoDir }
    );

    fs.writeFileSync(path.join(repoDir, "file.txt"), "version 1\n");
    child_process.execFileSync("git", ["add", "."], { cwd: repoDir });
    child_process.execFileSync("git", ["commit", "-m", "Init"], { cwd: repoDir });

    const projectsFile = path.join(tmpDir, "projects.json");
    const silentLogger = createLogger({ level: "silent" });
    const registry = new ProjectRegistry(projectsFile, silentLogger);
    const proj = registry.add(repoDir, { name: "AttackRepo" });
    projectId = proj.id;

    gitService = new GitService(registry, new GitProcessRunner(silentLogger), silentLogger);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("neutralizes malicious diff.external, textconv, fsmonitor, and hooks during diff and status", async () => {
    // Clear any marker created during beforeAll raw git setup commands
    if (fs.existsSync(markerFile)) {
      fs.unlinkSync(markerFile);
    }

    // Modify file
    fs.writeFileSync(path.join(repoDir, "file.txt"), "version 2 (modified)\n");

    // Perform git.status
    const status = await gitService.getStatus({ projectId });
    expect(status.clean).toBe(false);
    // Assert marker file was NOT created
    expect(fs.existsSync(markerFile)).toBe(false);

    // Perform git.diff
    const diff = await gitService.getDiff({ projectId });
    expect(diff.files).toContain("file.txt");
    expect(diff.diff).toContain("+version 2 (modified)");
    // Assert marker file was STILL NOT created
    expect(fs.existsSync(markerFile)).toBe(false);

    // Perform git.info
    const info = await gitService.getInfo({ projectId });
    expect(info.isRepository).toBe(true);
    expect(fs.existsSync(markerFile)).toBe(false);

    // Perform git.log
    const log = await gitService.getLog({ projectId });
    expect(log.commits.length).toBeGreaterThan(0);
    expect(fs.existsSync(markerFile)).toBe(false);
  });
});
