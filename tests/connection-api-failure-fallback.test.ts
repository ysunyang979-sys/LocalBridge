import { describe, it, expect } from "vitest";
import {
  BUILTIN_CLIENT_CATALOG,
  mergeCatalogWithSavedConnections,
} from "../apps/desktop/src/components/connections/catalog.js";
import type { AIConnectionDto } from "../apps/desktop/src/types.js";

describe("Connection API Failure Fallback Suite", () => {
  it("renders all 6 catalog items when savedConnections is empty (e.g. database error)", () => {
    const merged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], null);

    expect(merged.length).toBe(6);
    expect(merged.map((c) => c.clientType)).toEqual([
      "chatgpt",
      "kimi",
      "claude",
      "gemini",
      "deepseek",
      "custom-openai",
    ]);

    for (const item of merged) {
      expect(item.status).toBe("not_configured");
      expect(item.toolCount).toBe(55);
      expect(item.scopes).toContain("read");
    }
  });

  it("preserves catalog integrity even if API returns malformed or unexpected empty data", () => {
    const emptySaved: AIConnectionDto[] = [];
    const merged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, emptySaved, {
      status: "Disconnected",
    });

    expect(merged.length).toBe(6);
    const kimi = merged.find((c) => c.clientType === "kimi");
    expect(kimi).toBeDefined();
    expect(kimi?.name).toBe("Kimi Code");
    expect(kimi?.category).toBe("native-mcp");

    const deepseek = merged.find((c) => c.clientType === "deepseek");
    expect(deepseek).toBeDefined();
    expect(deepseek?.name).toBe("DeepSeek");
    expect(deepseek?.category).toBe("tool-adapter");
  });

  it("accurately merges partial saved connection without mutating catalog definitions", () => {
    const savedKimi: AIConnectionDto = {
      id: "conn_kimi",
      clientType: "kimi",
      name: "My Custom Kimi",
      category: "native-mcp",
      status: "configured",
      transport: "http",
      endpoint: "http://127.0.0.1:18080/mcp",
      tokenId: "tok_12345",
      tokenMasked: "lb_••••••••1234",
      scopes: ["read", "write"],
      toolCount: 55,
      isPrimary: false,
      detectedConfigPath: "/home/user/.kimi-code/mcp.json",
      isDetected: true,
      latencyMs: 15,
    };

    const merged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [savedKimi], null);
    expect(merged.length).toBe(6);

    const mergedKimi = merged.find((c) => c.clientType === "kimi");
    expect(mergedKimi).toBeDefined();
    expect(mergedKimi?.name).toBe("My Custom Kimi");
    expect(mergedKimi?.status).toBe("configured");
    expect(mergedKimi?.tokenMasked).toBe("lb_••••••••1234");
    expect(mergedKimi?.isDetected).toBe(true);
    expect(mergedKimi?.detectedConfigPath).toBe("/home/user/.kimi-code/mcp.json");

    // Other catalog items remain untouched
    const claude = merged.find((c) => c.clientType === "claude");
    expect(claude?.status).toBe("not_configured");
  });
});
