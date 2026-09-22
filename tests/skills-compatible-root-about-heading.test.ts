import { describe, expect, it } from "vitest";
import { isGenericHeading, extractMarkdownMetadata } from "@localbridge/protocol";

describe("Skills Compatible Root About Heading Handling", () => {
  it("identifies generic headings and avoids assigning 'About' as Skill Name", () => {
    expect(isGenericHeading("About")).toBe(true);
    expect(isGenericHeading("## About")).toBe(true);
    expect(isGenericHeading("Usage")).toBe(true);
    expect(isGenericHeading("Overview")).toBe(true);

    const docWithAbout = `<p align="center"><img src="x.png" /></p>
## About
When an agent encounters a problem, it routes to tools.
`;

    const meta = extractMarkdownMetadata(docWithAbout, "reverse-skill");
    expect(meta.title).not.toBe("About");
    expect(meta.title).toBe("Reverse Skill");
    expect(meta.desc).toContain("When an agent encounters a problem");
  });
});
