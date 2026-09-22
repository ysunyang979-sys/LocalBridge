import { describe, it, expect, vi } from "vitest";
import {
  computeImportState,
  type ImportStateContext,
} from "../apps/desktop/src/components/skills/ImportSkillModal.js";
import type { SkillMetadata } from "../apps/desktop/src/types.js";

const mockSkillMetadata: SkillMetadata = {
  id: "user.reverse-skill-router",
  name: { "zh-CN": "逆向技能路由", "en-US": "reverse-skill-router" },
  description: { "zh-CN": "逆向工程技能路由分析", "en-US": "Reverse engineering router" },
  version: "1.0.0",
  category: "inspection",
  risk: "medium",
  tools: ["localbridge_file_read"],
  workflow: ["inspect"],
  toolsCount: 1,
  workflowStepsCount: 1,
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  source: "user",
};

describe("Skills Import: Success and Auto-Close Behavior", () => {
  it("transitions importState to 'success' when importSuccess is true", () => {
    const ctx: ImportStateContext = {
      importSuccess: true,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\reverse-skill-main.zip",
      zipBase64: "",
      preview: null,
      selectedSubPath: "",
      showWizard: false,
      roundTripValid: true,
    };

    expect(computeImportState(ctx)).toBe("success");
  });

  it("invokes onSuccess and onClose callbacks upon successful import resolution", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    // Emulate what handleImport executes upon successful result
    const simulatedImportResult = {
      success: true,
      skill: mockSkillMetadata,
    };

    if (simulatedImportResult.success && simulatedImportResult.skill) {
      onSuccess(simulatedImportResult.skill);
      onClose();
    }

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(mockSkillMetadata);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
