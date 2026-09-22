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

describe("Skills Compatible: Single-Root ZIP Archive Detection", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-single-root-"));
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

  it("detects single-root-directory in GitHub-style ZIP and identifies root prefix", async () => {
    const zipBuffer = createZip([
      { path: "reverse-analysis-main/SKILL.md", data: "# Reverse Analysis\nTools and guides for reverse engineering." },
      { path: "reverse-analysis-main/README.md", data: "# Readme" },
      { path: "reverse-analysis-main/docs/guide.md", data: "Guide details" },
    ]);

    const preview = await importer.previewZip(zipBuffer, "user");
    expect(preview.detectedRoot).toMatch(/reverse-analysis-main/);
    expect(["raw", "compatible"]).toContain(preview.importMode);
    expect(preview.skillDocFound).toBe(true);
    expect(preview.manifestFound).toBe(false);
    expect(["valid", "needs_setup"]).toContain(preview.validationStatus);
  });
});
