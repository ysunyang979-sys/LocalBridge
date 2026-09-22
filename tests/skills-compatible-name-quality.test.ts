import { describe, expect, it } from "vitest";
import { extractMarkdownMetadata, isGenericHeading } from "@localbridge/protocol";

describe("Skills Compatible Name Quality", () => {
  it("rejects generic headings like Table of Contents and Overview as Skill Name", () => {
    expect(isGenericHeading("Table of Contents")).toBe(true);
    expect(isGenericHeading("Overview")).toBe(true);
    expect(isGenericHeading("Introduction")).toBe(true);

    const markdown = `# Table of Contents
1. Intro
2. Usage
`;

    const meta = extractMarkdownMetadata(markdown, "my-awesome-tool");
    expect(meta.title).toBe("My Awesome Tool");
    expect(meta.isGenericTitle).toBe(true);
  });

  it("extracts explicit frontmatter title when present", () => {
    const frontmatterDoc = `---
name: competition-specialist
description: Deep inspection workflow
---
# Generic Heading
Details here.
`;

    const meta = extractMarkdownMetadata(frontmatterDoc, "fallback");
    expect(meta.title).toBe("competition-specialist");
    expect(meta.desc).toBe("Deep inspection workflow");
  });
});
