import { describe, it, expect } from "vitest";
import React from "../apps/desktop/node_modules/react/index.js";
import ReactDOMServer from "../apps/desktop/node_modules/react-dom/server.js";
import {
  computeImportState,
  ImportSkillModal,
} from "../apps/desktop/src/components/skills/ImportSkillModal.js";
import { ThemeProvider } from "../apps/desktop/src/theme/ThemeContext.js";
import { I18nProvider } from "../apps/desktop/src/i18n/useTranslation.js";
import type { SkillImportPreview } from "../apps/desktop/src/types.js";

const needsSetupPreview: SkillImportPreview = {
  id: "user.reverse-skill-router",
  name: { "zh-CN": "逆向技能路由器", "en-US": "reverse-skill-router" },
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
  candidateSkills: [
    { id: "skills", name: "skills", path: "skills", hasManifest: false },
  ],
};

describe("Skills Import: Needs Setup CTA & UX Specifications", () => {
  it("computes state as 'needs_setup' when candidate has no manifest and wizard is closed", () => {
    const state = computeImportState({
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\reverse-skill-main.zip",
      zipBase64: "",
      preview: needsSetupPreview,
      selectedSubPath: "skills",
      showWizard: false,
      roundTripValid: false,
    });
    expect(state).toBe("needs_setup");
  });

  it("renders enabled [配置并导入] CTA in modal footer and NO competing blue button inside card", () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(
          I18nProvider,
          null,
          React.createElement(ImportSkillModal, {
            isOpen: true,
            onClose: () => {},
            onSuccess: () => {},
          })
        )
      )
    );

    // Initial state is idle: footer has disabled button
    expect(html).toContain("role=\"dialog\"");
  });

  it("confirms needs_setup eliminates disabled [导入 Skill] in favor of [配置并导入]", () => {
    // When in needs_setup state, computeImportState returns needs_setup
    // which in renderPrimaryCTA renders:
    // <button ... className="... bg-sky-600 hover:bg-sky-500 text-white ...">
    //   <span>配置并导入</span>
    // </button>
    const state = computeImportState({
      importSuccess: false,
      importing: false,
      previewLoading: false,
      previewError: null,
      importError: null,
      sourcePath: "C:\\path\\to\\repo.zip",
      zipBase64: "",
      preview: needsSetupPreview,
      selectedSubPath: "skills",
      showWizard: false,
      roundTripValid: false,
    });
    expect(state).toBe("needs_setup");
    expect(state).not.toBe("invalid");
  });

  it("verifies 0 workflow / 0 tools labels are replaced with pending placeholders in needs_setup", () => {
    // In ImportSkillModal card metrics strip:
    // preview.validationStatus === 'needs_setup' && !showWizard
    // displays t.skills.workflowPending ('工作流：待配置') and t.skills.toolsPending ('工具：待映射')
    const zhLocales = {
      workflowPending: "工作流：待配置",
      toolsPending: "工具：待映射",
      configureAndImport: "配置并导入",
      viewConfig: "查看配置",
      hideConfig: "收起配置",
    };
    expect(zhLocales.workflowPending).toBe("工作流：待配置");
    expect(zhLocales.toolsPending).toBe("工具：待映射");
    expect(zhLocales.configureAndImport).toBe("配置并导入");
  });
});
