import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import YAML from "yaml";
import {
  serializeSkillManifest,
  validateSkillManifestRoundTrip,
  type SkillYamlInput,
} from "@localbridge/protocol";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";

describe("Skills Manifest Special Characters Import (Section 16)", () => {
  let tmpRoot: string;
  let userSkillsDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "special-chars-"));
    userSkillsDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userSkillsDir, { recursive: true });

    const tools = new Set(["localbridge_file_read", "localbridge_file_write"]);
    const validator = new SkillValidator(tools);
    const loader = new SkillLoader(validator, { userDir: userSkillsDir });
    registry = new SkillRegistry(loader);
    importer = new SkillImporter({
      validator,
      loader,
      registry,
      validMcpTools: tools,
    });
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("handles malicious and special characters: quotes, colons, html, and newlines end-to-end", async () => {
    const srcFolder = path.join(tmpRoot, "source-skill");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(path.join(srcFolder, "SKILL.md"), "# Test Skill\n\nWorkflow instructions.");

    // Section 16 exact inputs
    const manifestInput: SkillYamlInput = {
      id: "user.special-chars-skill",
      version: "1.0.0",
      name: {
        "zh-CN": 'Test "Skill": Alpha',
        "en-US": 'Test "Skill": Alpha',
      },
      description: {
        "zh-CN": 'Use <p align="center"> and "quoted" values:\nline 2',
        "en-US": 'Use <p align="center"> and "quoted" values:\nline 2',
      },
      category: "general",
      risk: "medium",
      triggers: ['why: "broken"'],
      tools: ["localbridge_file_read"],
      workflow: ['inspect "foo"', "fix: bar"],
      enabled: true,
    };

    // 1. Validate Round-Trip
    const roundTrip = validateSkillManifestRoundTrip(manifestInput);
    expect(roundTrip.valid).toBe(true);
    expect(roundTrip.errors).toHaveLength(0);

    // 2. Verify YAML parse succeeds
    const parsed = YAML.parse(roundTrip.yaml);
    expect(parsed.name["zh-CN"]).toBe('Test "Skill": Alpha');
    expect(parsed.description["zh-CN"]).toBe('Use <p align="center"> and "quoted" values:\nline 2');
    expect(parsed.triggers[0]).toBe('why: "broken"');
    expect(parsed.workflow[0]).toBe('inspect "foo"');
    expect(parsed.workflow[1]).toBe("fix: bar");

    // 3. Import through SkillImporter
    const importResult = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
      customYaml: roundTrip.yaml,
      overwrite: true,
    });

    expect(importResult.success).toBe(true);
    expect(importResult.skill?.id).toBe("user.special-chars-skill");

    // 4. Verify disk content
    const installedDir = path.join(userSkillsDir, "user.special-chars-skill");
    expect(fs.existsSync(path.join(installedDir, "skill.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, "SKILL.md"))).toBe(true);

    const installedYamlContent = fs.readFileSync(path.join(installedDir, "skill.yaml"), "utf-8");
    const installedParsed = YAML.parse(installedYamlContent);
    expect(installedParsed.name["zh-CN"]).toBe('Test "Skill": Alpha');
    expect(installedParsed.description["zh-CN"]).toBe('Use <p align="center"> and "quoted" values:\nline 2');

    // 5. Verify registry reloads and returns skill
    const retrieved = registry.getSkill("user.special-chars-skill");
    expect(retrieved).toBeDefined();
    expect(retrieved?.name["zh-CN"]).toBe('Test "Skill": Alpha');
  });
});
