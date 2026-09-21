import { describe, it, expect } from "vitest";
import {
  BUILTIN_CLIENT_CATALOG,
  mergeCatalogWithSavedConnections,
} from "../apps/desktop/src/components/connections/catalog.js";
import type { AIConnectionDto } from "../apps/desktop/src/types.js";

describe("Builtin Connections Visibility & Custom Separation Suite", () => {
  it("ensures native-mcp group has at least 4 built-ins: ChatGPT, Kimi, Claude, Gemini", () => {
    const all = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], null);
    const nativeMcp = all.filter((c) => c.category === "native-mcp");

    expect(nativeMcp.length).toBeGreaterThanOrEqual(4);
    const types = nativeMcp.map((c) => c.clientType);
    expect(types).toContain("chatgpt");
    expect(types).toContain("kimi");
    expect(types).toContain("claude");
    expect(types).toContain("gemini");
  });

  it("ensures tool-adapter group has DeepSeek and OpenAI-compatible", () => {
    const all = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], null);
    const adapters = all.filter((c) => c.category === "tool-adapter");

    expect(adapters.length).toBeGreaterThanOrEqual(2);
    const types = adapters.map((c) => c.clientType);
    expect(types).toContain("deepseek");
    expect(types).toContain("custom-openai");
  });

  it("appends custom user connections while keeping all built-ins intact", () => {
    const customMcp: AIConnectionDto = {
      id: "conn_custom_cursor",
      clientType: "custom-mcp",
      name: "Cursor IDE MCP",
      category: "native-mcp",
      status: "connected",
      transport: "http",
      scopes: ["read", "write"],
      toolCount: 55,
      isPrimary: false,
    };

    const customModel: AIConnectionDto = {
      id: "conn_custom_qwen",
      clientType: "custom-openai",
      name: "Local Qwen 2.5 72B",
      category: "tool-adapter",
      status: "connected",
      transport: "http",
      scopes: ["read", "write"],
      toolCount: 55,
      isPrimary: false,
    };

    const all = mergeCatalogWithSavedConnections(
      BUILTIN_CLIENT_CATALOG,
      [customMcp, customModel],
      null
    );

    // 6 built-ins + 2 custom = 8 items
    expect(all.length).toBe(8);

    const nativeMcp = all.filter((c) => c.category === "native-mcp");
    expect(nativeMcp.length).toBe(5); // ChatGPT, Kimi, Claude, Gemini + Cursor
    expect(nativeMcp.map((c) => c.id)).toContain("conn_custom_cursor");

    const adapters = all.filter((c) => c.category === "tool-adapter");
    expect(adapters.length).toBe(3); // DeepSeek, OpenAI-compat + Qwen
    expect(adapters.map((c) => c.id)).toContain("conn_custom_qwen");
  });
});
