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

describe("Skills Compatible: Document and Safe Resource Import", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-doc-import-"));
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

  it("safely imports markdown, txt, json, and image files while ignoring scripts", async () => {
    const zip = createZip([
      {
        path: "skill.yaml",
        data: `id: user.doc-pack
version: 1.0.0
name: { zh-CN: 文档包, en-US: Doc Pack }
description: { zh-CN: 描述, en-US: Description }
category: general
risk: low
triggers: ["docs"]
tools: ["localbridge_file_read"]
workflow: ["inspect"]
`,
      },
      { path: "SKILL.md", data: "# Skill Docs" },
      { path: "docs/spec.txt", data: "Text documentation" },
      { path: "data/config.json", data: '{"version": 1}' },
      { path: "assets/diagram.png", data: Buffer.from([137, 80, 78, 71]) },
      { path: "build.sh", data: "#!/bin/sh" },
    ]);

    const result = await importer.importZip({
      zipBufferOrPath: zip,
      target: "user",
    });

    expect(result.success).toBe(true);

    const installDir = path.join(userDir, "user.doc-pack");
    expect(fs.existsSync(path.join(installDir, "docs", "spec.txt"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "data", "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "assets", "diagram.png"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "build.sh"))).toBe(false);
  });
});
