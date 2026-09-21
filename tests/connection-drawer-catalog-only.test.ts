import { describe, it, expect } from "vitest";
import { BUILTIN_CLIENT_CATALOG } from "../apps/desktop/src/components/connections/catalog.js";
import { resolveConnectionViewModel } from "../apps/desktop/src/components/connections/view-model.js";

describe("Drawer Catalog-Only Item Resilience Suite", () => {
  it("safely resolves catalog items without any saved connection in database", () => {
    for (const catalogItem of BUILTIN_CLIENT_CATALOG) {
      // Simulate raw catalog item with no saved database fields
      const rawCatalogItem = {
        id: catalogItem.id,
        name: catalogItem.name,
        category: catalogItem.category,
        clientType: catalogItem.clientType,
        status: catalogItem.defaultStatus,
        quickActionType: catalogItem.quickActionType,
        transport: catalogItem.transport,
        endpoint: catalogItem.endpoint,
        scopes: catalogItem.scopes || ["read", "write"],
        metadata: catalogItem.metadata,
        // Notice: no tokenId, no config, no apiKey, no lastSeen, no latencyMs
      };

      const vm = resolveConnectionViewModel(rawCatalogItem as any, null);
      expect(vm).not.toBeNull();
      expect(vm!.source).toBe("builtin");
      expect(vm!.id).toBe(catalogItem.id);
      expect(vm!.name).toBe(catalogItem.name);
      expect(vm!.status).toBeDefined();

      // Defensive access checks: accessing missing fields should return safe fallbacks, never throw
      expect(vm!.tokenId).toBeNull();
      expect(vm!.lastSeen).toBeNull();
      expect(vm!.latencyMs).toBeNull();
      expect(Array.isArray(vm!.scopes)).toBe(true);
      expect(vm!.scopes.length).toBeGreaterThan(0);
    }
  });

  it("distinguishes catalog-only Kimi Web from configured Kimi Web", () => {
    const kimi = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "kimi-web")!;
    const vm = resolveConnectionViewModel(kimi, null)!;

    expect(vm.source).toBe("builtin");
    expect(vm.savedConnectionId).toBeUndefined();
    expect(vm.status).toBe("not_configured");
    expect(vm.isPrimary).toBe(false);
  });

  it("does not crash when accessing deeply nested properties on catalog items", () => {
    const deepseek = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "deepseek")!;
    const vm = resolveConnectionViewModel(deepseek, null)!;

    expect(vm.metadata).toBeDefined();
    expect(vm.metadata?.apiFormat).toBe("openai-compatible");
    expect(vm.metadata?.model).toBe("deepseek-chat");
  });
});
