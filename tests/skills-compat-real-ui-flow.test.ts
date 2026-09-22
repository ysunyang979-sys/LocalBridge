import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-compat-real-ui-flow: End-to-End Desktop Flow with reverse-skill-main.zip", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));
  const zip1 = "e:\\22365\\下载\\reverse-skill-main(1)\\reverse-skill-main.zip";
  const zip2 = "e:\\22365\\下载\\reverse-skill-main.zip";
  const realZipPath = fs.existsSync(zip1) ? zip1 : zip2;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-ui-flow-test-"));
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

  it("simulates full UI flow: drop zip -> detect candidates -> select competition-ad -> generate wizard YAML -> import", async () => {
    if (!fs.existsSync(realZipPath)) return;

    // Step 1: Initial Preview of ZIP
    const previewAll = await importer.previewZip(realZipPath, "user");
    expect(previewAll.candidateSkills?.length).toBeGreaterThan(0);
    expect(previewAll.archiveTotalExecutables).toBe(72);

    // Step 2: Select candidate competition-ad-certificate-abuse
    const candidateSubPath = "CTF-Sandbox-Orchestrator/competition-ad-certificate-abuse";
    const previewCandidate = await importer.previewZip(realZipPath, "user", undefined, candidateSubPath);
    expect(["warning", "valid", "needs_setup"]).toContain(previewCandidate.validationStatus);
    expect(previewCandidate.archiveTotalExecutables).toBe(72);
    expect(previewCandidate.candidateExecutablesCount).toBe(0);
    expect(previewCandidate.skillDocFound).toBe(true);

    // Step 3: Wizard generates YAML
    const wizardYaml = `id: user.competition-ad-certificate-abuse
version: "1.0.0"
name:
  zh-CN: Competition AD Certificate Abuse
  en-US: Competition AD Certificate Abuse
description:
  zh-CN: AD CS privilege abuse analysis
  en-US: AD CS privilege abuse analysis
category: general
risk: medium
triggers:
  - ad certificate
  - competition-ad-certificate-abuse
tools:
  - localbridge_file_read
  - localbridge_code_diagnostics
workflow:
  - inspect
  - triage
  - summarize
enabled: true
`;

    // Step 4: Import
    const importResult = await importer.importZip({
      zipBufferOrPath: realZipPath,
      target: "user",
      overwrite: true,
      customYaml: wizardYaml,
      subPath: candidateSubPath,
    });

    expect(importResult.success).toBe(true);
    expect(importResult.skill?.id).toBe("user.competition-ad-certificate-abuse");

    // Step 5: Verify in Registry
    const loaded = registry.getSkill("user.competition-ad-certificate-abuse");
    expect(loaded).toBeDefined();
    expect(loaded?.instructions).toContain("competition-ad-certificate-abuse");
  });
});
