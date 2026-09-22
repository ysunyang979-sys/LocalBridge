import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modalFilePath = path.resolve(
  __dirname,
  "../apps/desktop/src/components/skills/ImportSkillModal.tsx"
);

describe("skills-import-no-single-dropdown: Elimination of Single Candidate Dropdown", () => {
  it("ensures ImportSkillModal.tsx does not contain single candidate select dropdown or intermediate confirm button", () => {
    const content = fs.readFileSync(modalFilePath, "utf-8");

    // 1. Must NOT contain the old single candidate dropdown
    expect(content).not.toContain("selectedSubPath");
    expect(content).not.toContain("仓库根目录");
    expect(content).not.toContain("确认候选");
    expect(content).not.toContain("发现多项候选子技能，请选择要导入的一项");

    // 2. Must contain the multi-select candidate list components
    expect(content).toContain("selectedCandidateIds");
    expect(content).toContain("candidateSearch");
    expect(content).toContain("handleBatchImport");
    expect(content).toContain("全选");
    expect(content).toContain("导入全部");
  });
});
