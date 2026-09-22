import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-raw-registry: Registry Integration for Raw User Skills", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-raw-reg-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    loader = new SkillLoader(validator, { userDir });
    registry = new SkillRegistry(loader);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("loads raw user skills from disk with correct default fields and metadata", () => {
    const rawSkillDir = path.join(userDir, "user.cloud-pentest");
    fs.mkdirSync(rawSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(rawSkillDir, "SKILL.md"),
      "# Cloud Penetration Testing\n\nMethodologies for AWS and GCP infrastructure security reviews."
    );
    fs.writeFileSync(
      path.join(rawSkillDir, "raw-skill.json"),
      JSON.stringify({
        id: "user.cloud-pentest",
        name: "Cloud Penetration Testing",
        type: "raw",
        version: "1.0.0",
        description: "Methodologies for AWS and GCP infrastructure security reviews.",
        primaryDocument: "SKILL.md",
        availableDocuments: ["SKILL.md"],
        documents: ["SKILL.md"],
      })
    );

    registry.reload();

    const skill = registry.getSkill("user.cloud-pentest");
    expect(skill).toBeDefined();
    expect(skill?.id).toBe("user.cloud-pentest");
    expect(skill?.type).toBe("raw");
    expect(skill?.tools).toEqual([]);
    expect(skill?.workflow).toEqual([]);
    expect(skill?.enabled).toBe(true);
    expect(skill?.validationStatus).toBe("valid");
    expect(skill?.primaryDocument).toBe("SKILL.md");

    const allSkills = registry.listSkills();
    const found = allSkills.find((s) => s.id === "user.cloud-pentest");
    expect(found).toBeDefined();
    expect(found?.type).toBe("raw");
  });
});
