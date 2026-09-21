import { describe, it, expect } from "vitest";
import {
  BUILTIN_CLIENT_CATALOG,
  mergeCatalogWithSavedConnections,
} from "../apps/desktop/src/components/connections/catalog.js";

describe("Built-in Connection Catalog Definition Suite", () => {
  it("contains all required built-in AI providers including Kimi Web and Kimi Code", () => {
    const clientTypes = BUILTIN_CLIENT_CATALOG.map((c) => c.clientType);
    expect(clientTypes).toContain("chatgpt");
    expect(clientTypes).toContain("kimi-web");
    expect(clientTypes).toContain("kimi");
    expect(clientTypes).toContain("claude");
    expect(clientTypes).toContain("gemini");
    expect(clientTypes).toContain("deepseek");
    expect(clientTypes).toContain("custom-openai");
    expect(BUILTIN_CLIENT_CATALOG.length).toBe(7);
  });

  it("strictly distinguishes Kimi Web (standard tunnel plugin) from Kimi Code (advanced CLI mcp.json)", () => {
    const kimiWeb = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "kimi-web");
    expect(kimiWeb).toBeDefined();
    expect(kimiWeb!.category).toBe("native-mcp");
    expect(kimiWeb!.transport).toBe("tunnel");
    expect(kimiWeb!.quickActionType).toBe("kimi-plugin");
    expect(kimiWeb!.isAdvancedOnly).toBe(false);
    expect(kimiWeb!.endpoint).toContain("mcp");

    const kimiCode = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "kimi");
    expect(kimiCode).toBeDefined();
    expect(kimiCode!.category).toBe("native-mcp");
    expect(kimiCode!.transport).toBe("http");
    expect(kimiCode!.quickActionType).toBe("apply-config");
    expect(kimiCode!.isAdvancedOnly).toBe(true);
    expect(kimiCode!.endpoint).toBe("http://127.0.0.1:18080/mcp");
  });

  it("strictly categorizes DeepSeek as a tool-adapter and never native-mcp", () => {
    const deepseek = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "deepseek");
    expect(deepseek).toBeDefined();
    expect(deepseek!.category).toBe("tool-adapter");
    expect(deepseek!.category).not.toBe("native-mcp");
    expect(deepseek!.metadata?.apiFormat).toBe("openai-compatible");
    expect(deepseek!.metadata?.model).toBe("deepseek-chat");
  });

  it("strictly categorizes OpenAI-compatible as a tool-adapter", () => {
    const openai = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "custom-openai");
    expect(openai).toBeDefined();
    expect(openai!.category).toBe("tool-adapter");
    expect(openai!.metadata?.apiFormat).toBe("openai-compatible");
  });

  it("categorizes ChatGPT, Kimi Web, Kimi Code, Claude, Gemini as native-mcp", () => {
    const nativeClients = ["chatgpt", "kimi-web", "kimi", "claude", "gemini"];
    for (const type of nativeClients) {
      const client = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === type);
      expect(client).toBeDefined();
      expect(client!.category).toBe("native-mcp");
    }
  });

  it("assigns ChatGPT and Kimi Web to tunnel transport and local CLI to standard transports", () => {
    const chatgpt = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "chatgpt");
    expect(chatgpt!.transport).toBe("tunnel");

    const kimiWeb = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "kimi-web");
    expect(kimiWeb!.transport).toBe("tunnel");

    const kimi = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "kimi");
    expect(kimi!.transport).toBe("http");

    const claude = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "claude");
    expect(claude!.transport).toBe("http");

    const gemini = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "gemini");
    expect(gemini!.transport).toBe("http");
  });

  it("has valid bilingual descriptions and quick action types for all catalog items", () => {
    for (const item of BUILTIN_CLIENT_CATALOG) {
      expect(item.descriptionZh.length).toBeGreaterThan(10);
      expect(item.descriptionEn.length).toBeGreaterThan(10);
      expect(["tunnel", "kimi-plugin", "apply-config", "api-key", "details"]).toContain(
        item.quickActionType
      );
      expect(item.toolCount).toBe(55);
    }
  });
});
