import { describe, it, expect } from "vitest";
import {
  computeImportState,
  type ImportStateContext,
} from "../apps/desktop/src/components/skills/ImportSkillModal.js";
import type { SkillImportPreview } from "../apps/desktop/src/types.js";

function createMockPreview(overrides: Partial<SkillImportPreview> = {}): SkillImportPreview {
  return {
    id: "user.sample-skill",
    name: { "zh-CN": "测试技能", "en-US": "Test Skill" },
    description: { "zh-CN": "描述", "en-US": "Desc" },
    version: "1.0.0",
    category: "general",
    risk: "low",
    tools: ["localbridge_file_read"],
    workflow: ["step1"],
    toolsCount: 1,
    workflowStepsCount: 1,
    valid: true,
    validationStatus: "valid",
    hasConflict: false,
    ...overrides,
  };
}

function createDefaultContext(overrides: Partial<ImportStateContext> = {}): ImportStateContext {
  return {
    importSuccess: false,
    importing: false,
    previewLoading: false,
    previewError: null,
    importError: null,
    sourcePath: "",
    zipBase64: "",
    preview: null,
    selectedSubPath: "",
    showWizard: false,
    roundTripValid: false,
    ...overrides,
  };
}

describe("Skills Import CTA: State Machine Core Transitions", () => {
  it("returns 'idle' when no source is selected and no preview exists", () => {
    const ctx = createDefaultContext();
    expect(computeImportState(ctx)).toBe("idle");
  });

  it("returns 'source_selected' when sourcePath is provided but preview has not loaded", () => {
    const ctx = createDefaultContext({ sourcePath: "C:\\path\\to\\skill.zip" });
    expect(computeImportState(ctx)).toBe("source_selected");
  });

  it("returns 'source_selected' while previewLoading is true", () => {
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\skill.zip",
      previewLoading: true,
    });
    expect(computeImportState(ctx)).toBe("source_selected");
  });

  it("returns 'error' when previewError is set", () => {
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\skill.zip",
      previewError: "Failed to read zip archive",
    });
    expect(computeImportState(ctx)).toBe("error");
  });

  it("returns 'preview_valid' when multiple candidate skills are detected (ready for batch import)", () => {
    const preview = createMockPreview({
      validationStatus: "needs_setup",
      candidateSkills: [
        { id: "alpha", name: "Alpha", path: "skills/alpha", hasManifest: false },
        { id: "beta", name: "Beta", path: "skills/beta", hasManifest: false },
      ],
    });
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\repo.zip",
      preview,
    });
    expect(computeImportState(ctx)).toBe("preview_valid");
  });

  it("returns 'needs_setup' when candidate is selected and validationStatus is needs_setup without wizard open", () => {
    const preview = createMockPreview({
      validationStatus: "needs_setup",
      valid: false,
      candidateSkills: [
        { id: "alpha", name: "Alpha", path: "skills/alpha", hasManifest: false },
      ],
    });
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\repo.zip",
      preview,
      selectedSubPath: "skills/alpha",
      showWizard: false,
    });
    expect(computeImportState(ctx)).toBe("needs_setup");
  });

  it("returns 'configuring' when needs_setup wizard is open but roundTrip is invalid", () => {
    const preview = createMockPreview({
      validationStatus: "needs_setup",
      valid: false,
    });
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\repo.zip",
      preview,
      showWizard: true,
      roundTripValid: false,
    });
    expect(computeImportState(ctx)).toBe("configuring");
  });

  it("returns 'preview_valid' when needs_setup wizard is open and roundTrip is valid", () => {
    const preview = createMockPreview({
      validationStatus: "needs_setup",
      valid: false,
    });
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\repo.zip",
      preview,
      showWizard: true,
      roundTripValid: true,
    });
    expect(computeImportState(ctx)).toBe("preview_valid");
  });

  it("returns 'preview_valid' directly for standard valid skills", () => {
    const preview = createMockPreview({
      validationStatus: "valid",
      valid: true,
    });
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\native-skill.zip",
      preview,
    });
    expect(computeImportState(ctx)).toBe("preview_valid");
  });

  it("returns 'preview_valid' for warning skills (warning does not block import)", () => {
    const preview = createMockPreview({
      validationStatus: "warning",
      valid: true,
      securityWarning: "10 executable files excluded",
    });
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\warning-skill.zip",
      preview,
    });
    expect(computeImportState(ctx)).toBe("preview_valid");
  });

  it("returns 'invalid' when validationStatus is invalid", () => {
    const preview = createMockPreview({
      validationStatus: "invalid",
      valid: false,
      validationErrors: ["Unknown MCP Tool: unknown_tool"],
    });
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\bad.zip",
      preview,
    });
    expect(computeImportState(ctx)).toBe("invalid");
  });

  it("returns 'invalid' when skill conflicts with a builtin skill", () => {
    const preview = createMockPreview({
      validationStatus: "valid",
      valid: true,
      hasConflict: true,
      isBuiltinConflict: true,
    });
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\builtin-override.zip",
      preview,
    });
    expect(computeImportState(ctx)).toBe("invalid");
  });

  it("returns 'importing' when importing flag is active regardless of preview", () => {
    const preview = createMockPreview({
      validationStatus: "valid",
      valid: true,
    });
    const ctx = createDefaultContext({
      sourcePath: "C:\\path\\to\\skill.zip",
      preview,
      importing: true,
    });
    expect(computeImportState(ctx)).toBe("importing");
  });

  it("returns 'success' when importSuccess is true", () => {
    const ctx = createDefaultContext({
      importSuccess: true,
    });
    expect(computeImportState(ctx)).toBe("success");
  });
});
