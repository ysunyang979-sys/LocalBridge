import { describe, expect, it } from "vitest";
import { hasToolScope, requiredScopeForTool } from "../apps/server/src/mcp/scope-policy.js";

describe("MCP central scope policy", () => {
  it("maps representative tools to the exact release scopes", () => {
    expect(requiredScopeForTool("localbridge_file_read")).toBe("read");
    expect(requiredScopeForTool("localbridge_file_write")).toBe("write");
    expect(requiredScopeForTool("localbridge_command_run")).toBe("execute");
  });

  it("denies read-only token from writes", () => {
    expect(hasToolScope(["read"], "localbridge_file_write")).toBe(false);
  });

  it("denies write-only token from execution", () => {
    expect(hasToolScope(["write"], "localbridge_command_run")).toBe(false);
  });

  it("does not let execute imply write", () => {
    expect(hasToolScope(["execute"], "localbridge_file_delete")).toBe(false);
  });

  it("denies every tool to an empty scope set", () => {
    expect(hasToolScope([], "localbridge_project_list")).toBe(false);
    expect(hasToolScope([], "localbridge_file_create")).toBe(false);
    expect(hasToolScope([], "localbridge_test_start")).toBe(false);
  });
});
