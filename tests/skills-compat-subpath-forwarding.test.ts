import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-compat-subpath-forwarding: Candidate subPath Forwarding", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-subpath-fwd-test-"));
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

  it("imports only the selected subPath candidate and ignores other siblings", async () => {
    const multiRepo = path.join(tmpRoot, "multi-repo");
    const subCandidateA = path.join(multiRepo, "skills", "candidate-a");
    const subCandidateB = path.join(multiRepo, "skills", "candidate-b");

    fs.mkdirSync(subCandidateA, { recursive: true });
    fs.mkdirSync(subCandidateB, { recursive: true });

    fs.writeFileSync(path.join(subCandidateA, "SKILL.md"), "# Candidate A Instructions");
    fs.writeFileSync(path.join(subCandidateA, "a-marker.txt"), "MARKER_A");

    fs.writeFileSync(path.join(subCandidateB, "SKILL.md"), "# Candidate B Instructions");
    fs.writeFileSync(path.join(subCandidateB, "b-marker.txt"), "MARKER_B");

    const customYaml = `id: user.candidate-a-skill
version: "1.0.0"
name:
  zh-CN: 候选技能 A
  en-US: Candidate Skill A
description:
  zh-CN: 仅导入候选 A
  en-US: Only import candidate A
category: general
risk: low
triggers:
  - candidate-a
tools:
  - localbridge_file_read
workflow:
  - inspect
enabled: true
`;

    const result = await importer.importFolder({
      sourcePath: multiRepo,
      target: "user",
      subPath: "skills/candidate-a",
      customYaml,
    });

    expect(result.success).toBe(true);
    const installDir = path.join(userDir, "user.candidate-a-skill");
    expect(fs.existsSync(path.join(installDir, "a-marker.txt"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "b-marker.txt"))).toBe(false);
  });
});
