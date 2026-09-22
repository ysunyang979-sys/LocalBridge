import { describe, expect, it } from "vitest";
import { stripHtml, extractMarkdownMetadata } from "@localbridge/protocol";

describe("Skills Compatible Root HTML Header Handling", () => {
  it("does not leak raw HTML tags like <p align=\"center\"> into description", () => {
    const htmlHeader = `<p align="center">
  <img src="banner.png" />
</p>
<h1 align="center">My Project</h1>
<p align="center">A cybersecurity toolchain for testing</p>
`;

    const meta = extractMarkdownMetadata(htmlHeader, "my-project");
    expect(meta.title).toBe("My Project");
    expect(meta.desc).toBe("A cybersecurity toolchain for testing");
    expect(meta.desc).not.toContain("<p");
    expect(meta.desc).not.toContain("align=");
  });

  it("returns empty string when stripping isolated unclosed HTML tags", () => {
    expect(stripHtml('<p align="center">')).toBe("");
    expect(stripHtml("<br/>")).toBe("");
    expect(stripHtml('<img src="test.png" />')).toBe("");
  });
});
