import { describe, expect, it } from "vitest";
import { evaluateCandidateQuality } from "@localbridge/protocol";

describe("Skills Compatible Root Quality Evaluation", () => {
  it("rates repository root with only README and banner as invalid candidate with negative score", () => {
    const rawRepoReadme = `<p align="center">
  <img src="banner.png" alt="banner" />
</p>
<h1 align="center">awesome-repo</h1>
<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/stars-100-blue" /></a>
</p>
## About
This is a general repository description.
`;

    const quality = evaluateCandidateQuality({
      isRoot: true,
      hasSkillMd: false,
      hasManifest: false,
      content: rawRepoReadme,
    });

    expect(quality.hasSkillMd).toBe(false);
    expect(quality.isHtmlHeavy).toBe(true);
    expect(quality.score).toBeLessThan(30);
    expect(quality.isValidCandidate).toBe(false);
  });

  it("rates candidate with SKILL.md and workflow as valid candidate with high score", () => {
    const skillContent = `# Awesome Skill
## Purpose
Analyze certificate abuse.
## Workflow
### 1. Enumerate templates
### 2. Verify mapping
## Tools
localbridge_file_read
`;

    const quality = evaluateCandidateQuality({
      isRoot: false,
      hasSkillMd: true,
      hasManifest: false,
      content: skillContent,
    });

    expect(quality.hasSkillMd).toBe(true);
    expect(quality.hasWorkflow).toBe(true);
    expect(quality.score).toBeGreaterThanOrEqual(60);
    expect(quality.isValidCandidate).toBe(true);
  });
});
