import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { registerSkillTools } from "../apps/server/src/mcp/tools/skills.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("skills-collection-document-get: Related Document Retrieval and Security", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  let tools: Map<string, Function>;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-doc-get-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    loader = new SkillLoader(validator, { userDir });
    registry = new SkillRegistry(loader);

    tools = new Map();
    const mockServer: any = {
      registerTool: (name: string, _schema: any, handler: Function) => {
        tools.set(name, handler);
      },
    };
    const mockContext: any = {
      skillRegistry: registry,
      logAudit: () => {},
      getIntelligenceStatus: () => ({ status: "disabled" }),
    };
    registerSkillTools(mockServer, mockContext);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("reads referenced document within skill directory", async () => {
    const skillDir = path.join(userDir, "user.test-skill");
    fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Main\nSee references/details.md");
    fs.writeFileSync(path.join(skillDir, "references", "details.md"), "# Detailed Notes\nImportant context.");
    fs.writeFileSync(
      path.join(skillDir, "raw-skill.json"),
      JSON.stringify({
        id: "user.test-skill",
        name: "test-skill",
        type: "raw",
        enabled: true,
        primaryDocument: "SKILL.md",
        availableDocuments: ["SKILL.md", "references/details.md"],
      })
    );

    registry.reload();

    const getTool = tools.get("localbridge_skill_get");
    expect(getTool).toBeDefined();

    const res = await getTool!({
      skillId: "user.test-skill",
      documentPath: "references/details.md",
    });

    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.documentPath).toBe("references/details.md");
    expect(parsed.content).toBe("# Detailed Notes\nImportant context.");
  });

  it("blocks path traversal attempting to escape skill directory", async () => {
    const skillDir = path.join(userDir, "user.test-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Main");
    fs.writeFileSync(
      path.join(skillDir, "raw-skill.json"),
      JSON.stringify({
        id: "user.test-skill",
        name: "test-skill",
        type: "raw",
        enabled: true,
      })
    );

    // Secret file outside skillDir
    fs.writeFileSync(path.join(tmpRoot, "secret.txt"), "TOP_SECRET_DATA");

    registry.reload();

    const getTool = tools.get("localbridge_skill_get");
    const res = await getTool!({
      skillId: "user.test-skill",
      documentPath: "../../secret.txt",
    });

    expect(res.isError).toBe(true);
    expect(res.structuredContent?.code).toBe(LocalBridgeErrorCode.PATH_TRAVERSAL);
    expect(res.content[0].text).toContain("escapes skill directory");
  });
});
