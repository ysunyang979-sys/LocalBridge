import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Sidebar Responsive Layout & Quality Contract Suite", () => {
  const sidebarPath = path.resolve(process.cwd(), "apps/desktop/src/components/Sidebar.tsx");
  const sidebarCode = fs.readFileSync(sidebarPath, "utf-8");

  it("verifies explicit width constants for collapsed (60px) and expanded (228px) states", () => {
    expect(sidebarCode).toContain("w-[60px]");
    expect(sidebarCode).toContain("w-[228px]");
  });

  it("verifies single 32x32 brand avatar container", () => {
    // 32px is w-8 h-8 in Tailwind
    expect(sidebarCode).toContain("w-8 h-8");
  });

  it("ensures top-pinned toggle button handles rail collapsing", () => {
    expect(sidebarCode).toContain("setCollapsed");
    expect(sidebarCode).toContain("ChevronLeft");
    expect(sidebarCode).toContain("ChevronRight");
  });

  it("verifies centered icon tooltips and navigation items", () => {
    // Tooltip attributes
    expect(sidebarCode).toContain("title={collapsed ? item.label : undefined}");
    expect(sidebarCode).toContain("navItems");
    expect(sidebarCode).toContain("shortcut");
  });

  it("verifies strict display of product version 1.2.0", () => {
    expect(sidebarCode).toContain("1.2.0");
    expect(sidebarCode).not.toContain("v2.0.0");
  });
});
