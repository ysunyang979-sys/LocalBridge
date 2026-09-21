import { describe, it, expect } from "vitest";
import { resolveConnectionViewModel } from "../apps/desktop/src/components/connections/view-model.js";

describe("Defensive View Model Null & Malformed Data Suite", () => {
  it("returns null safely when connection is null or undefined without throwing", () => {
    expect(() => resolveConnectionViewModel(null, null)).not.toThrow();
    expect(resolveConnectionViewModel(null, null)).toBeNull();

    expect(() => resolveConnectionViewModel(undefined as any, null)).not.toThrow();
    expect(resolveConnectionViewModel(undefined as any, null)).toBeNull();
  });

  it("handles empty object with all fields missing gracefully", () => {
    const emptyConn = {} as any;
    expect(() => resolveConnectionViewModel(emptyConn, null)).not.toThrow();

    const vm = resolveConnectionViewModel(emptyConn, null);
    expect(vm).not.toBeNull();
    expect(vm!.id).toBe("unknown");
    expect(vm!.name).toBe("Unknown Client");
    expect(vm!.status).toBe("not_configured");
    expect(vm!.scopes).toEqual([]);
    expect(vm!.toolsCount).toBe(0);
    expect(vm!.metadata).toEqual({});
  });

  it("handles null / non-array scopes safely", () => {
    const connWithNullScopes = {
      id: "test-null-scopes",
      name: "Test Null Scopes",
      scopes: null,
    } as any;

    const vm = resolveConnectionViewModel(connWithNullScopes, null);
    expect(vm).not.toBeNull();
    expect(Array.isArray(vm!.scopes)).toBe(true);
    expect(vm!.scopes).toEqual([]);
  });

  it("handles malformed metadata or non-object metadata safely", () => {
    const connWithBadMeta = {
      id: "test-bad-meta",
      name: "Bad Meta Client",
      metadata: "string-instead-of-object",
    } as any;

    const vm = resolveConnectionViewModel(connWithBadMeta, null);
    expect(vm).not.toBeNull();
    expect(vm!.metadata).toEqual({});
  });

  it("handles null tunnelStatus safely without failing remote endpoint resolution", () => {
    const kimiConn = {
      id: "builtin-kimi-web",
      name: "Kimi Web",
      clientType: "kimi-web",
      transport: "tunnel",
      endpoint: "https://<nexus-tunnel-host>/mcp",
    } as any;

    const vm = resolveConnectionViewModel(kimiConn, null);
    expect(vm).not.toBeNull();
    // In absence of tunnel, should not crash, and should yield empty or fallback string
    expect(typeof vm!.endpoint).toBe("string");
  });
});
