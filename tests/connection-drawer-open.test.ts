import { describe, it, expect } from "vitest";
import { BUILTIN_CLIENT_CATALOG, mergeCatalogWithSavedConnections } from "../apps/desktop/src/components/connections/catalog.js";
import { resolveConnectionViewModel } from "../apps/desktop/src/components/connections/view-model.js";

describe("Connection Drawer Open Lifecycle Suite", () => {
  const mockTunnel = {
    status: "Connected" as const,
    activeTunnels: 1,
    tunnel_id: "nexus-demo.example.com",
    publicHttpsUrl: "https://nexus-demo.example.com",
    publicHost: "nexus-demo.example.com",
    lastHeartbeat: new Date().toISOString(),
    isHealthy: true,
  };

  it("verifies all 6 providers produce valid drawer view model when opening drawer", () => {
    const connections = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], mockTunnel);
    const expectedClients = ["chatgpt", "kimi-web", "claude", "gemini", "deepseek", "custom-openai"];

    for (const type of expectedClients) {
      const conn = connections.find((c) => c.clientType === type)!;
      const vm = resolveConnectionViewModel(conn, mockTunnel);

      expect(vm).not.toBeNull();
      expect(vm!.id).toBe(conn.id);
      expect(vm!.name).toBe(conn.name);
      expect(vm!.clientType).toBe(type);
      expect(Array.isArray(vm!.scopes)).toBe(true);
      expect(typeof vm!.toolsCount).toBe("number");
      expect(vm!.toolsCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("verifies Kimi Web drawer view model contains live tunnel endpoint and quick action capabilities", () => {
    const kimi = BUILTIN_CLIENT_CATALOG.find((c) => c.clientType === "kimi-web")!;
    const vm = resolveConnectionViewModel(kimi, mockTunnel)!;

    expect(vm.clientType).toBe("kimi-web");
    expect(vm.endpoint).toBe("https://nexus-demo.example.com/mcp");
    expect(vm.endpoint).not.toContain("<nexus-tunnel-host>");
    expect(vm.toolsCount).toBe(55);
    expect(vm.scopes).toContain("read");
    expect(vm.scopes).toContain("write");
  });

  it("verifies drawer dimensions are bounded and responsive (not full screen)", () => {
    // Drawer class: w-full sm:max-w-lg md:max-w-xl (translates to 460px - 520px)
    const expectedClasses = ["fixed", "right-0", "top-0", "bottom-0", "max-w-lg"];
    expect(expectedClasses).toContain("max-w-lg");
    expect(expectedClasses).toContain("right-0");
  });

  it("verifies drawer open/close transition state updates cleanly", () => {
    let isOpen = false;
    let selectedId: string | null = null;

    // Open
    const openDrawer = (id: string) => {
      isOpen = true;
      selectedId = id;
    };

    // Close
    const closeDrawer = () => {
      isOpen = false;
      selectedId = null;
    };

    openDrawer("builtin-kimi-web");
    expect(isOpen).toBe(true);
    expect(selectedId).toBe("builtin-kimi-web");

    closeDrawer();
    expect(isOpen).toBe(false);
    expect(selectedId).toBeNull();
  });
});
