import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skills Compatible: Real reverse-skill-main.zip Acceptance Test", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));
  const realZipPath = "e:\\22365\\下载\\reverse-skill-main.zip";

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-real-reverse-zip-"));
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

  it("successfully previews reverse-skill-main.zip as Needs Setup with excluded executables", async () => {
    if (!fs.existsSync(realZipPath)) {
      console.warn("Real ZIP not found at " + realZipPath + ", skipping real acceptance test");
      return;
    }

    const preview = await importer.previewZip(realZipPath, "user");
    expect(["warning", "needs_setup"]).toContain(preview.validationStatus);
    expect(preview.manifestFound).toBe(false);
    expect(preview.skillDocFound).toBe(true);
    expect(preview.detectedRoot).toMatch(/reverse-skill-main/);
    expect(preview.executableFilesFound?.length).toBeGreaterThanOrEqual(10);
    expect(preview.securityWarning).toMatch(/可执行资源|executable/i);
  });

  it("converts reverse-skill-main.zip into a safe user skill without installing any executables", async () => {
    if (!fs.existsSync(realZipPath)) return;

    const customYaml = `id: user.reverse-skill
version: 1.0.0
name:
  zh-CN: 逆向分析技能库
  en-US: Reverse Engineering Skill Library
description:
  zh-CN: 逆向工程与安全分析指导知识库
  en-US: Reverse engineering and security analysis guidelines
category: inspection
risk: medium
triggers:
  - 逆向分析
  - 逆向
  - 反编译
  - reverse engineering
tools:
  - localbridge_file_read
  - localbridge_code_diagnostics
workflow:
  - inspect_targets
  - triage_artifacts
  - summarize_findings
enabled: true
`;

    const result = await importer.importZip({
      zipBufferOrPath: realZipPath,
      target: "user",
      customYaml,
    });

    expect(result.success).toBe(true);
    expect(result.skill?.id).toBe("user.reverse-skill");

    // Verify disk: zero executable files installed!
    const installDir = path.join(userDir, "user.reverse-skill");
    expect(fs.existsSync(path.join(installDir, "skill.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "SKILL.md"))).toBe(true);

    // Recursively check installDir for any .bat, .sh, .jar, .js, .exe
    const entries = fs.readdirSync(installDir, { recursive: true });
    const executablePattern = /\.(sh|bash|bat|cmd|exe|jar|py|node|dll)$/i;
    for (const entry of entries) {
      const name = typeof entry === "string" ? entry : (entry as any).name;
      expect(executablePattern.test(name)).toBe(false);
    }

    // Verify registry query
    const skill = registry.getSkill("user.reverse-skill");
    expect(skill).toBeDefined();
    expect(skill?.id).toBe("user.reverse-skill");
    expect(skill?.name["zh-CN"]).toBe("逆向分析技能库");
  });
});
