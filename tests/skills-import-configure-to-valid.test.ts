import { describe, it, expect } from "vitest";
import {
  computeImportState,
  type ImportStateContext,
} from "../apps/desktop/src/components/skills/ImportSkillModal.js";
import { validateSkillManifestRoundTrip } from "@localbridge/protocol";
import type { SkillImportPreview } from "../apps/desktop/src/types.js";

const baseNeedsSetupPreview: SkillImportPreview = {
  id: "user.reverse-skill-router",
  name: { "zh-CN": "逆向技能路由", "en-US": "reverse-skill-router" },
  description: { "zh-CN": "逆向工程技能路由分析", "en-US": "Reverse engineering router" },
  version: "1.0.0",
  category: "inspection",
  risk: "medium",
  tools: [],
  workflow: [],
  toolsCount: 0,
  workflowStepsCount: 0,
  valid: false,
  validationStatus: "needs_setup",
  hasConflict: false,
  manifestFound: false,
  skillDocFound: true,
};

describe("Skills Import: Configure-to-Valid Dynamic Transition Flow", () => {
  it("starts in 'needs_setup' when wizard is closed", () => {
    const ctx: ImportStateContext = {
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\reverse-skill-main.zip",
      zipBase64: "",
      preview: baseNeedsSetupPreview,
      selectedSubPath: "skills",
      showWizard: false,
      roundTripValid: false,
    };

    expect(computeImportState(ctx)).toBe("needs_setup");
  });

  it("transitions to 'configuring' if wizard is open but fields fail roundTrip validation", () => {
    // Missing required fields or invalid ID (e.g. UPPERCASE which fails SkillIdSchema)
    const invalidManifest = {
      id: "INVALID_UPPERCASE_ID",
      version: "1.0.0",
      name: { "zh-CN": "", "en-US": "" },
      description: { "zh-CN": "", "en-US": "" },
      category: "general",
      risk: "low",
      triggers: [],
      tools: [],
      workflow: [],
      enabled: true,
    };

    const roundTrip = validateSkillManifestRoundTrip(invalidManifest as any);
    expect(roundTrip.valid).toBe(false);

    const ctx: ImportStateContext = {
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\reverse-skill-main.zip",
      zipBase64: "",
      preview: baseNeedsSetupPreview,
      selectedSubPath: "skills",
      showWizard: true,
      roundTripValid: roundTrip.valid,
    };

    // State becomes 'configuring' -> footer button is disabled [完善配置]
    expect(computeImportState(ctx)).toBe("configuring");
  });

  it("transitions to 'preview_valid' as soon as wizard fields satisfy roundTrip schema", () => {
    const validManifest = {
      id: "user.reverse-skill-router",
      version: "1.0.0",
      name: { "zh-CN": "逆向工程技能路由", "en-US": "Reverse Skill Router" },
      description: { "zh-CN": "自动化分析与路由", "en-US": "Automated analysis router" },
      category: "inspection",
      risk: "medium",
      triggers: ["reverse", "逆向"],
      tools: ["localbridge_file_read", "localbridge_code_diagnostics"],
      workflow: ["inspect_target", "summarize_findings"],
      enabled: true,
    };

    const roundTrip = validateSkillManifestRoundTrip(validManifest as any);
    expect(roundTrip.valid).toBe(true);

    const ctx: ImportStateContext = {
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\reverse-skill-main.zip",
      zipBase64: "",
      preview: baseNeedsSetupPreview,
      selectedSubPath: "skills",
      showWizard: true,
      roundTripValid: roundTrip.valid,
    };

    // State becomes 'preview_valid' -> footer button automatically becomes [导入 Skill] ENABLED!
    expect(computeImportState(ctx)).toBe("preview_valid");
  });
});
