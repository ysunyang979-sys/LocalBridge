import type { PortListParams, PortListResult, PortSummary } from "@localbridge/protocol";
import { PortInspector } from "../../process/port-inspector.js";
import type { ProcessOwnershipTracker } from "../../process/ownership-tracker.js";

export function createPortListHandler(ownershipTracker: ProcessOwnershipTracker) {
  return async (params: PortListParams): Promise<PortListResult> => {
    const [rawPorts, procs] = await Promise.all([
      PortInspector.listPorts(),
      ownershipTracker.listProcesses(params.projectId, "ALL"),
    ]);

    const procMap = new Map<number, (typeof procs)[0]>();
    for (const p of procs) {
      procMap.set(p.pid, p);
    }

    const results: PortSummary[] = [];

    for (const rp of rawPorts) {
      if (params.port && rp.port !== params.port) continue;

      const proc = rp.pid ? procMap.get(rp.pid) : undefined;
      const ownership = proc ? proc.ownership : "UNOWNED";

      if (params.ownership && params.ownership !== "ALL" && ownership !== params.ownership) {
        continue;
      }

      if (params.projectId && proc?.projectId && proc.projectId !== params.projectId) {
        continue;
      }

      results.push({
        port: rp.port,
        protocol: rp.protocol,
        address: rp.address,
        state: rp.state,
        pid: rp.pid,
        processName: proc?.name,
        commandLine: proc?.commandLine,
        projectId: proc?.projectId,
        runtimeId: proc?.runtimeId,
        agentTaskId: proc?.agentTaskId,
        terminalSessionId: proc?.terminalSessionId,
        ownership,
      });
    }

    return {
      ports: results,
      total: results.length,
    };
  };
}
