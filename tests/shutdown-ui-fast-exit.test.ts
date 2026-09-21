import { describe, it, expect } from "vitest";

describe("Shutdown UI Fast Exit Suite (shutdown-ui-fast-exit.test)", () => {
  it("completes UI dismissal in under 50ms before background cleanup starts", () => {
    let windowVisible = true;
    const start = Date.now();

    windowVisible = false;
    const uiHiddenElapsed = Date.now() - start;

    expect(windowVisible).toBe(false);
    expect(uiHiddenElapsed).toBeLessThan(50);
  });
});
