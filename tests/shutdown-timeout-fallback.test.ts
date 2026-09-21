import { describe, it, expect } from "vitest";

describe("Shutdown Timeout Fallback Suite (shutdown-timeout-fallback.test)", () => {
  it("enforces bounded timeout when an async cleanup task hangs", async () => {
    async function boundedCleanup(hangingTask: Promise<void>, timeoutMs: number): Promise<"clean" | "timeout"> {
      let timer: NodeJS.Timeout;
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      });

      const result = await Promise.race([
        hangingTask.then(() => "clean" as const),
        timeoutPromise,
      ]);
      clearTimeout(timer!);
      return result;
    }

    const hangingTask = new Promise<void>((resolve) => setTimeout(resolve, 5000));

    const start = Date.now();
    const outcome = await boundedCleanup(hangingTask, 300);
    const elapsed = Date.now() - start;

    expect(outcome).toBe("timeout");
    expect(elapsed).toBeLessThan(600);
  });
});
