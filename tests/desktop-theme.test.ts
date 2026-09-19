import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectInitialThemeMode, applyThemeToDocument } from "../apps/desktop/src/theme/ThemeContext.js";

describe("Desktop Theme Engine Suite", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    // Mock minimal localStorage if not present
    let store: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  it("defaults to 'system' mode when localStorage is empty", () => {
    localStorage.clear();
    expect(detectInitialThemeMode()).toBe("system");
  });

  it("reads explicitly saved theme modes ('light' / 'dark' / 'system')", () => {
    localStorage.setItem("localbridge_theme", "light");
    expect(detectInitialThemeMode()).toBe("light");

    localStorage.setItem("localbridge_theme", "dark");
    expect(detectInitialThemeMode()).toBe("dark");

    localStorage.setItem("localbridge_theme", "system");
    expect(detectInitialThemeMode()).toBe("system");
  });

  it("gracefully falls back to 'system' when invalid or corrupted mode is saved", () => {
    localStorage.setItem("localbridge_theme", "neon-blue");
    expect(detectInitialThemeMode()).toBe("system");

    localStorage.setItem("localbridge_theme", "");
    expect(detectInitialThemeMode()).toBe("system");
  });

  it("applies data-theme and colorScheme to document element", () => {
    // Mock minimal document.documentElement
    const mockDocElement = {
      attributes: {} as Record<string, string>,
      style: {} as Record<string, string>,
      setAttribute(name: string, value: string) {
        this.attributes[name] = value;
      },
      getAttribute(name: string) {
        return this.attributes[name] ?? null;
      },
    };

    const originalDoc = globalThis.document;
    try {
      Object.defineProperty(globalThis, "document", {
        value: { documentElement: mockDocElement } as any,
        configurable: true,
      });

      applyThemeToDocument("light");
      expect(mockDocElement.getAttribute("data-theme")).toBe("light");
      expect(mockDocElement.style.colorScheme).toBe("light");

      applyThemeToDocument("dark");
      expect(mockDocElement.getAttribute("data-theme")).toBe("dark");
      expect(mockDocElement.style.colorScheme).toBe("dark");
    } finally {
      Object.defineProperty(globalThis, "document", {
        value: originalDoc,
        configurable: true,
      });
    }
  });
});
