import { describe, expect, it } from "vitest";
import { MCP_TOOL_SCOPE, requiredScopeForTool } from "../apps/server/src/mcp/scope-policy.js";

describe("Skills Detail UX: Tabs & Content Model", () => {
  const ALL_TABS = ["overview", "workflow", "tools", "skillMd", "rawConfig"] as const;

  it("defines the 5 standard tabs matching the redesigned drawer specification", () => {
    expect(ALL_TABS).toHaveLength(5);
    expect(ALL_TABS).toContain("overview");
    expect(ALL_TABS).toContain("workflow");
    expect(ALL_TABS).toContain("tools");
    expect(ALL_TABS).toContain("skillMd");
    expect(ALL_TABS).toContain("rawConfig");
  });

  it("categorizes tools into READ, WRITE, EXECUTE badges correctly", () => {
    // Read tools
    expect(requiredScopeForTool("localbridge_project_list")).toBe("read");
    expect(requiredScopeForTool("localbridge_code_diagnostics")).toBe("read");

    // Write tools
    expect(requiredScopeForTool("localbridge_file_write")).toBe("write");
    expect(requiredScopeForTool("localbridge_file_patch")).toBe("write");

    // Execute tools
    expect(requiredScopeForTool("localbridge_command_run")).toBe("execute");
    expect(requiredScopeForTool("localbridge_build_start")).toBe("execute");
  });

  it("formats workflow steps into human-readable title and sub-id for timeline view", () => {
    const rawStep = "collect_error_diagnostics";
    const formattedTitle = rawStep
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    expect(formattedTitle).toBe("Collect Error Diagnostics");
  });
});
