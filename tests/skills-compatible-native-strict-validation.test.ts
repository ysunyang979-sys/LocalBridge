import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { createZip } from "../apps/server/src/skills/zip-util.js";

describe("Skills Compatible: Strict Validation for Native Skills", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-native-strict-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, { userDir });
    const registry = new SkillRegistry(loader);
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

  it("still strictly enforces schema and unknown tools when skill.yaml is present", async () => {
    const invalidNativeZip = createZip([
      {
        path: "skill.yaml",
        data: `id: user.invalid-native
version: 1.0.0
name: { zh-CN: 无效技能, en-US: Invalid }
description: { zh-CN: 描述, en-US: Desc }
category: invalid_cat_enum
risk: low
triggers: ["test"]
tools: ["non_existent_unregistered_tool"]
workflow: []
`,
      },
      { path: "SKILL.md", data: "# Invalid Native" },
    ]);

    const preview = await importer.previewZip(invalidNativeZip, "user");
    expect(preview.valid).toBe(false);
    expect(preview.validationStatus).toBe("invalid");
    expect(preview.validationErrors.some((e) => e.includes("category") || e.includes("non_existent"))).toBe(true);
  });
});
