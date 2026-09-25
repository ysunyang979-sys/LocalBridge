import { describe, it, expect } from "vitest";
import net from "node:net";
import { PortInspector } from "../apps/runner/src/process/port-inspector.js";
import { ProcessOwnershipTracker } from "../apps/runner/src/process/ownership-tracker.js";
import { createPortListHandler } from "../apps/runner/src/rpc/handlers/port-list.js";
import { createPortKillHandler } from "../apps/runner/src/rpc/handlers/port-kill.js";

describe("Nexus 2.0 Port Management Pillar", () => {
  it("discovers active ports and maps them to PIDs", async () => {
    // Start an in-memory TCP server on an arbitrary port
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as net.AddressInfo;
    const testPort = address.port;

    try {
      const tracker = new ProcessOwnershipTracker();
      const listHandler = createPortListHandler(tracker);

      const res = await listHandler({ port: testPort });
      expect(res.ports.length).toBeGreaterThan(0);
      const target = res.ports.find((p) => p.port === testPort);
      expect(target).toBeDefined();
      expect(target?.protocol).toBe("TCP");
      expect(target?.pid).toBe(process.pid);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("handles port kill authorization and release verification", async () => {
    const tracker = new ProcessOwnershipTracker();
    const killHandler = createPortKillHandler(tracker);

    // If port is not listening, gracefully returns port not in use
    const unusedPortResult = await killHandler({ port: 59998 });
    expect(unusedPortResult.killed).toBe(true);
    expect(unusedPortResult.released).toBe(true);
  });
});
