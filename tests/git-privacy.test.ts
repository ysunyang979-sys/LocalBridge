import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import child_process from "node:child_process";
import { GitProcessRunner } from "../apps/runner/src/git/process.js";
import { GitService } from "../apps/runner/src/git/service.js";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { createLogger } from "@localbridge/shared";

describe("Git Privacy & Zero Path Leakage (git-privacy)", () => {
  let tmpDir: string;
  let repoDir: string;
  let gitService: GitService;
  let projectId: string;
  let physicalPathMarker: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-git-privacy-"));
    repoDir = path.join(tmpDir, "privacy-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    // Store physical path marker to search for leaks
    physicalPathMarker = path.normalize(repoDir);

    child_process.execFileSync("git", ["init"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.name", "John Secret"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.email", "john.secret@internal.corp.com"], { cwd: repoDir });

    fs.writeFileSync(path.join(repoDir, "app.ts"), "export const a = 100;\n");
    child_process.execFileSync("git", ["add", "."], { cwd: repoDir });
    child_process.execFileSync(
      "git",
      ["commit", "-m", "Initial commit\n\nSecret corporate body details"],
      { cwd: repoDir }
    );

    // Create changes
    fs.writeFileSync(path.join(repoDir, "app.ts"), "export const a = 200;\n");
    fs.writeFileSync(path.join(repoDir, ".env"), "API_KEY=leakme");
    fs.writeFileSync(path.join(repoDir, "id_rsa"), "PRIVATE KEY CONTENT");

    const projectsFile = path.join(tmpDir, "projects.json");
    const silentLogger = createLogger({ level: "silent" });
    const registry = new ProjectRegistry(projectsFile, silentLogger);

    const proj = registry.add(repoDir, { name: "PrivacyRepo" });
    projectId = proj.id;

    gitService = new GitService(registry, new GitProcessRunner(silentLogger), silentLogger);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("guarantees git.info contains zero physical paths, drive letters, or remotes", async () => {
    const result = await gitService.getInfo({ projectId });
    const jsonStr = JSON.stringify(result);

    expect(jsonStr).not.toContain(physicalPathMarker);
    expect(jsonStr).not.toContain(".git");
    expect(jsonStr).not.toMatch(/[a-zA-Z]:\\/);
  });

  it("guarantees git.status contains zero physical paths, sensitive credentials, or drive letters", async () => {
    const result = await gitService.getStatus({ projectId });
    const jsonStr = JSON.stringify(result);

    expect(jsonStr).not.toContain(physicalPathMarker);
    expect(jsonStr).not.toContain(".git");
    expect(jsonStr).not.toContain(".env");
    expect(jsonStr).not.toContain("id_rsa");
    expect(jsonStr).not.toContain("API_KEY");
    expect(jsonStr).not.toMatch(/[a-zA-Z]:\\/);
  });

  it("guarantees git.diff contains zero physical paths, drive letters, or sensitive files", async () => {
    const result = await gitService.getDiff({ projectId });
    const jsonStr = JSON.stringify(result);

    expect(jsonStr).not.toContain(physicalPathMarker);
    expect(jsonStr).not.toContain(".git");
    expect(jsonStr).not.toContain(".env");
    expect(jsonStr).not.toContain("API_KEY");
    expect(jsonStr).not.toContain("id_rsa");
    expect(jsonStr).not.toMatch(/[a-zA-Z]:\\/);
  });

  it("guarantees git.log contains zero physical paths, author emails, or commit bodies", async () => {
    const result = await gitService.getLog({ projectId });
    const jsonStr = JSON.stringify(result);

    expect(jsonStr).not.toContain(physicalPathMarker);
    expect(jsonStr).not.toContain(".git");
    expect(jsonStr).not.toContain("john.secret@internal.corp.com");
    expect(jsonStr).not.toContain("Secret corporate body details");
    expect(jsonStr).not.toMatch(/[a-zA-Z]:\\/);
  });
});
