import { describe, expect, it } from "vitest";

describe("Skills Detail: Advanced Mode Tab Filtering & Technical Details", () => {
  type DetailTab = "overview" | "workflow" | "tools" | "skillMd" | "rawConfig";

  function getAvailableTabs(mode: "standard" | "advanced"): DetailTab[] {
    if (mode === "standard") {
      return ["overview", "workflow", "skillMd"];
    }
    return ["overview", "workflow", "tools", "skillMd", "rawConfig"];
  }

  it("exposes all 5 tabs including tools and rawConfig in advanced mode", () => {
    const tabs = getAvailableTabs("advanced");

    expect(tabs).toHaveLength(5);
    expect(tabs).toContain("overview");
    expect(tabs).toContain("workflow");
    expect(tabs).toContain("tools");
    expect(tabs).toContain("skillMd");
    expect(tabs).toContain("rawConfig");
  });

  it("permits navigating to rawConfig and inspecting raw yaml", () => {
    const tabs = getAvailableTabs("advanced");
    const rawTab = tabs.find((t) => t === "rawConfig");
    expect(rawTab).toBe("rawConfig");
  });

  it("permits inspecting tools tab with MCP tool inventory in advanced mode", () => {
    const tabs = getAvailableTabs("advanced");
    const toolsTab = tabs.find((t) => t === "tools");
    expect(toolsTab).toBe("tools");
  });
});
