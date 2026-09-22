import { describe, expect, it } from "vitest";
import { stripHtml } from "@localbridge/protocol";

describe("Skills Compatible README Sanitization", () => {
  it("strips complex html tags, links, and badges while preserving pure text", () => {
    const htmlSnippet = '<p align="center"><a href="https://example.com"><img src="badge.svg" /></a> <strong>Important Instruction</strong></p>';
    const cleaned = stripHtml(htmlSnippet);
    expect(cleaned).toBe("Important Instruction");
    expect(cleaned).not.toContain("<");
    expect(cleaned).not.toContain(">");
  });

  it("properly unescapes entities", () => {
    expect(stripHtml("Salt &amp; Pepper")).toBe("Salt & Pepper");
    expect(stripHtml("&lt;b&gt;bold text&lt;/b&gt;")).toBe("bold text");
    expect(stripHtml("&quot;quoted&quot;")).toBe('"quoted"');
  });
});
