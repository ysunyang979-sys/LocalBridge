import { describe, it, expect } from "vitest";
import {
  computeImportState,
  type ImportStateContext,
} from "../apps/desktop/src/components/skills/ImportSkillModal.js";
import type { SkillImportPreview } from "../apps/desktop/src/types.js";

function createInvalidPreview(overrides: Partial<SkillImportPreview> = {}): SkillImportPreview {
  return {
    id: "user.invalid-tool-skill",
    name: { "zh-CN": "非法技能", "en-US": "Invalid Skill" },
    description: { "zh-CN": "引用未知工具", "en-US": "References unknown tool" },
    version: "1.0.0",
    category: "general",
    risk: "high",
    tools: ["non_existent_dangerous_tool"],
    workflow: ["exec"],
    toolsCount: 1,
    workflowStepsCount: 1,
    valid: false,
    validationStatus: "invalid",
    hasConflict: false,
    validationErrors: [
      "Unknown MCP Tool: non_existent_dangerous_tool. Only registered MCP tools are permitted.",
    ],
    ...overrides,
  };
}

describe("Skills Import: Invalid CTA Specifications", () => {
  it("computes state as 'invalid' when validationStatus is 'invalid'", () => {
    const preview = createInvalidPreview();
    const ctx: ImportStateContext = {
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\invalid.zip",
      zipBase64: "",
      preview,
      selectedSubPath: "",
      showWizard: false,
      roundTripValid: false,
    };

    const state = computeImportState(ctx);
    expect(state).toBe("invalid");
  });

  it("computes state as 'invalid' when package conflicts with a builtin skill", () => {
    const preview = createInvalidPreview({
      id: "nexus.core-system",
      valid: false,
      hasConflict: true,
      isBuiltinConflict: true,
      validationErrors: ["Builtin skills in nexus.* namespace are protected and cannot be overwritten."],
    });

    const ctx: ImportStateContext = {
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\fake-core.zip",
      zipBase64: "",
      preview,
      selectedSubPath: "",
      showWizard: false,
      roundTripValid: false,
    };

    const state = computeImportState(ctx);
    expect(state).toBe("invalid");
  });

  it("retains specific validation error messages in preview object", () => {
    const preview = createInvalidPreview({
      validationErrors: [
        "Executable field 'entrypoint' is forbidden",
        "Invalid schema: version must follow semver",
      ],
    });

    expect(preview.validationErrors).toBeDefined();
    expect(preview.validationErrors?.length).toBe(2);
    expect(preview.validationErrors?.[0]).toContain("forbidden");
  });
});
