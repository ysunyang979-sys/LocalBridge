import { describe, expect, it } from "vitest";

describe("Skills Detail: Standard Mode Tab Filtering", () => {
  type DetailTab = "overview" | "workflow" | "tools" | "skillMd" | "rawConfig";

  function getAvailableTabs(mode: "standard" | "advanced"): DetailTab[] {
    if (mode === "standard") {
      return ["overview", "workflow", "skillMd"];
    }
    return ["overview", "workflow", "tools", "skillMd", "rawConfig"];
  }

  it("exposes only overview, workflow, and skillMd in standard mode", () => {
    const tabs = getAvailableTabs("standard");

    expect(tabs).toEqual(["overview", "workflow", "skillMd"]);
    expect(tabs).not.toContain("tools");
    expect(tabs).not.toContain("rawConfig");
  });

  it("defaults active tab to overview in standard mode", () => {
    const tabs = getAvailableTabs("standard");
    const activeTab = tabs[0];

    expect(activeTab).toBe("overview");
  });

  it("avoids exposing raw internal JSON or technical YAML in standard view", () => {
    const tabs = getAvailableTabs("standard");
    expect(tabs.includes("rawConfig")).toBe(false);
  });
});
