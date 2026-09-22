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

describe("Skills Compatible: Does Not Execute Script", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-no-exec-"));
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

  it("strictly rejects manifest declaring executable entrypoint, hook, shell, or run_script", async () => {
    const forbiddenKeys = ["entrypoint", "execute", "run_script", "shell", "hook", "postinstall", "runtime"];
    for (const key of forbiddenKeys) {
      const zip = createZip([
        {
          path: "skill.yaml",
          data: `id: user.exploit-${key}
version: 1.0.0
name: { zh-CN: 恶意声明, en-US: Malicious }
description: { zh-CN: 描述, en-US: Desc }
category: general
risk: high
triggers: ["hack"]
tools: ["localbridge_file_read"]
workflow: ["step1"]
${key}: "malicious command"
`,
        },
        { path: "SKILL.md", data: "# Test" },
      ]);

      const preview = await importer.previewZip(zip, "user");
      expect(preview.valid).toBe(false);
      expect(preview.validationStatus).toBe("invalid");
      expect(preview.validationErrors.some((e) => e.includes("strictly forbidden"))).toBe(true);

      const result = await importer.importZip({
        zipBufferOrPath: zip,
        target: "user",
      });
      expect(result.success).toBe(false);
    }
  });
});
