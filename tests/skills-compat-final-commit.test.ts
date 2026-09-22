import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-compat-final-commit: Production Import Commit", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));
  const zip1 = "e:\\22365\\下载\\reverse-skill-main(1)\\reverse-skill-main.zip";
  const zip2 = "e:\\22365\\下载\\reverse-skill-main.zip";
  const realZipPath = fs.existsSync(zip1) ? zip1 : zip2;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-commit-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, { userDir });
    registry = new SkillRegistry(loader);
    importer = new SkillImporter({
      validator,
      loader,
      registry,
      validMcpTools: activeTools,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("successfully completes final commit for competition-ad-certificate-abuse candidate", async () => {
    if (!fs.existsSync(realZipPath)) return;

    const candidateSubPath = "CTF-Sandbox-Orchestrator/competition-ad-certificate-abuse";
    const customYaml = `id: user.competition-ad-certificate-abuse
version: "1.0.0"
name:
  zh-CN: Competition AD Certificate Abuse
  en-US: Competition AD Certificate Abuse
description:
  zh-CN: AD CS and certificate abuse analysis guide
  en-US: AD CS and certificate abuse analysis guide
category: general
risk: medium
triggers:
  - competition-ad-certificate-abuse
  - ad certificate
tools:
  - localbridge_file_read
  - localbridge_code_diagnostics
workflow:
  - inspect
  - triage
  - summarize
enabled: true
`;

    const result = await importer.importZip({
      zipBufferOrPath: realZipPath,
      target: "user",
      overwrite: true,
      customYaml,
      subPath: candidateSubPath,
    });

    expect(result.success).toBe(true);
    expect(result.skill).toBeDefined();
    expect(result.skill?.id).toBe("user.competition-ad-certificate-abuse");

    // Verify filesystem
    const targetDir = path.join(userDir, "user.competition-ad-certificate-abuse");
    expect(fs.existsSync(path.join(targetDir, "skill.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "SKILL.md"))).toBe(true);

    // Verify 0 executables
    const entries = fs.readdirSync(targetDir, { recursive: true });
    const execFiles = entries.filter((e) =>
      /\.(sh|bash|zsh|ps1|bat|cmd|exe|jar|js|py|dll)$/i.test(typeof e === "string" ? e : (e as any).name)
    );
    expect(execFiles.length).toBe(0);
  });
});
