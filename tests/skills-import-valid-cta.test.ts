import { describe, it, expect } from "vitest";
import {
  computeImportState,
  type ImportStateContext,
} from "../apps/desktop/src/components/skills/ImportSkillModal.js";
import type { SkillImportPreview } from "../apps/desktop/src/types.js";

function createValidPreview(overrides: Partial<SkillImportPreview> = {}): SkillImportPreview {
  return {
    id: "user.code-assistant",
    name: { "zh-CN": "代码助手", "en-US": "Code Assistant" },
    description: { "zh-CN": "辅助代码分析与生成", "en-US": "Code analysis assistant" },
    version: "1.0.0",
    category: "general",
    risk: "low",
    tools: ["localbridge_file_read", "localbridge_file_write"],
    workflow: ["read_source", "analyze"],
    toolsCount: 2,
    workflowStepsCount: 2,
    valid: true,
    validationStatus: "valid",
    hasConflict: false,
    isBuiltinConflict: false,
    ...overrides,
  };
}

describe("Skills Import: Valid CTA Specifications", () => {
  it("transitions directly to 'preview_valid' for valid native skills without opening wizard", () => {
    const preview = createValidPreview();
    const ctx: ImportStateContext = {
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\native-skill.zip",
      zipBase64: "",
      preview,
      selectedSubPath: "",
      showWizard: false,
      roundTripValid: false,
    };

    const state = computeImportState(ctx);
    expect(state).toBe("preview_valid");
  });

  it("remains 'preview_valid' when non-builtin conflict exists to allow replacement CTA", () => {
    const preview = createValidPreview({
      hasConflict: true,
      isBuiltinConflict: false,
      conflictTarget: "user",
    });
    const ctx: ImportStateContext = {
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\native-skill.zip",
      zipBase64: "",
      preview,
      selectedSubPath: "",
      showWizard: false,
      roundTripValid: false,
    };

    const state = computeImportState(ctx);
    expect(state).toBe("preview_valid");
  });

  it("transitions to 'importing' when import action is triggered", () => {
    const preview = createValidPreview();
    const ctx: ImportStateContext = {
      importSuccess: false,
      importing: true,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\native-skill.zip",
      zipBase64: "",
      preview,
      selectedSubPath: "",
      showWizard: false,
      roundTripValid: false,
    };

    const state = computeImportState(ctx);
    expect(state).toBe("importing");
  });

  it("transitions to 'success' upon successful installation", () => {
    const ctx: ImportStateContext = {
      importSuccess: true,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\native-skill.zip",
      zipBase64: "",
      preview: createValidPreview(),
      selectedSubPath: "",
      showWizard: false,
      roundTripValid: false,
    };

    const state = computeImportState(ctx);
    expect(state).toBe("success");
  });
});
