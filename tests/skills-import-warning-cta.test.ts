import { describe, it, expect } from "vitest";
import {
  computeImportState,
  type ImportStateContext,
} from "../apps/desktop/src/components/skills/ImportSkillModal.js";
import type { SkillImportPreview } from "../apps/desktop/src/types.js";

function createWarningPreview(overrides: Partial<SkillImportPreview> = {}): SkillImportPreview {
  return {
    id: "user.repo-with-scripts",
    name: { "zh-CN": "带脚本的外部技能", "en-US": "External Skill with Scripts" },
    description: { "zh-CN": "含辅助构建脚本但清单合法的技能包", "en-US": "Skill with build scripts" },
    version: "1.0.0",
    category: "general",
    risk: "medium",
    tools: ["localbridge_file_read"],
    workflow: ["read_docs"],
    toolsCount: 1,
    workflowStepsCount: 1,
    valid: true,
    validationStatus: "warning",
    hasConflict: false,
    executableFilesFound: ["build.sh", "install.bat", "run.py"],
    excludedFilesCount: 3,
    securityWarning: "发现 3 个外部脚本文件，已声明式排除安装，不影响声明式技能导入",
    ...overrides,
  };
}

describe("Skills Import: Warning CTA Specifications", () => {
  it("computes state as 'preview_valid' when validationStatus is 'warning'", () => {
    const preview = createWarningPreview();
    const ctx: ImportStateContext = {
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\archive-with-scripts.zip",
      zipBase64: "",
      preview,
      selectedSubPath: "",
      showWizard: false,
      roundTripValid: false,
    };

    const state = computeImportState(ctx);
    expect(state).toBe("preview_valid");
  });

  it("ensures warning status does NOT disable import button", () => {
    const preview = createWarningPreview();
    // Verify that preview.valid is true and validationStatus is warning
    expect(preview.valid).toBe(true);
    expect(preview.validationStatus).toBe("warning");

    const state = computeImportState({
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\archive-with-scripts.zip",
      zipBase64: "",
      preview,
      selectedSubPath: "",
      showWizard: false,
      roundTripValid: false,
    });

    // Must be preview_valid (enabled CTA), never invalid or disabled
    expect(state).toBe("preview_valid");
    expect(state).not.toBe("invalid");
  });

  it("verifies security warning is present and lists excluded executable files count", () => {
    const preview = createWarningPreview();
    expect(preview.executableFilesFound?.length).toBe(3);
    expect(preview.excludedFilesCount).toBe(3);
    expect(preview.securityWarning).toContain("外部脚本");
  });
});
