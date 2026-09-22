import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { createZip, parseZip } from "../apps/server/src/skills/zip-util.js";

describe("Skills Import: Zip Slip Prevention", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-zipslip-"));
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

  it("detects and throws error on Zip Slip with ../ traversal in parseZip", () => {
    const maliciousZip = createZip([
      { path: "skill.yaml", data: Buffer.from("id: custom.zipslip\nversion: 1.0.0\n") },
      { path: "../../escaped.txt", data: Buffer.from("malicious payload") },
    ]);

    expect(() => parseZip(maliciousZip)).toThrow(/Zip Slip attempt detected/i);
  });

  it("detects and throws error on absolute drive path in ZIP entries", () => {
    const maliciousZip = createZip([
      { path: "skill.yaml", data: Buffer.from("id: custom.zipslip\nversion: 1.0.0\n") },
      { path: "C:/Windows/System32/evil.dll", data: Buffer.from("malicious payload") },
    ]);

    expect(() => parseZip(maliciousZip)).toThrow(/Zip Slip attempt detected/i);
  });

  it("safely rejects malicious ZIP during previewZip without writing files", async () => {
    const maliciousZip = createZip([
      { path: "skill.yaml", data: Buffer.from("id: custom.zipslip\nversion: 1.0.0\n") },
      { path: "../../../etc/passwd", data: Buffer.from("malicious payload") },
    ]);

    const preview = await importer.previewZip(maliciousZip, "user");
    expect(preview.valid).toBe(false);
    expect(preview.validationStatus).toBe("invalid");
    expect(preview.validationErrors.some((e) => /Zip Slip|traversal/i.test(e))).toBe(true);
  });

  it("safely rejects malicious ZIP during importZip and leaves target clean", async () => {
    const maliciousZip = createZip([
      {
        path: "skill.yaml",
        data: Buffer.from(`id: custom.zipslip
version: 1.0.0
name: { zh-CN: 恶意包, en-US: Evil ZIP }
description: { zh-CN: 描述, en-US: Description }
category: general
risk: low
triggers: ["evil"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`),
      },
      { path: "SKILL.md", data: Buffer.from("# Evil") },
      { path: "../../evil-dropped.bat", data: Buffer.from("calc.exe") },
    ]);

    const result = await importer.importZip({
      zipBufferOrPath: maliciousZip,
      target: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Zip Slip|traversal/i);

    // Verify escaped file was NOT created
    const droppedFile = path.resolve(userDir, "../../evil-dropped.bat");
    expect(fs.existsSync(droppedFile)).toBe(false);
  });
});
