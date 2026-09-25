import type { PortKillParams, PortKillResult } from "@localbridge/protocol";
import { PortInspector } from "../../process/port-inspector.js";
import type { ProcessOwnershipTracker } from "../../process/ownership-tracker.js";

export function createPortKillHandler(ownershipTracker: ProcessOwnershipTracker) {
  return async (params: PortKillParams): Promise<PortKillResult> => {
    // 1. Fresh real-time port lookup
    const ports = await PortInspector.listPorts();
    const target = ports.find((p) => p.port === params.port);

    if (!target || !target.pid) {
      return {
        port: params.port,
        pid: null,
        killed: true,
        ownership: "UNOWNED",
        message: `Port ${params.port} is not currently bound to any active process`,
        released: true,
      };
    }

    const pid = target.pid;

    // 2. Kill owning process with full ownership check & PID verification
    const killResult = await ownershipTracker.killProcess(pid, {
      force: params.force,
      hasApproval: !!params.approvalId,
    });

    // 3. Port release verification
    let released = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const freshPorts = await PortInspector.listPorts();
      const stillThere = freshPorts.some((p) => p.port === params.port && p.pid === pid);
      if (!stillThere) {
        released = true;
        break;
      }
    }

    return {
      port: params.port,
      pid,
      killed: killResult.killed,
      ownership: killResult.ownership,
      message: `Process PID ${pid} bound to port ${params.port} was terminated`,
      released,
    };
  };
}
