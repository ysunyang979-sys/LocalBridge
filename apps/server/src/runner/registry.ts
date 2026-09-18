import type { WebSocket } from "ws";
import type {
  RunnerCapabilities,
  RunnerPublic,
  RunnerSystemInfo,
} from "@localbridge/protocol";
import type { TokenRow } from "../db/schema.js";
import type { Logger } from "@localbridge/shared";

export interface RunnerConnection {
  runnerId: string;
  name: string;
  socket: WebSocket;
  tokenRecord: TokenRow;
  platform: string;
  arch: string;
  version: string;
  protocolVersion: string;
  capabilities: RunnerCapabilities;
  systemInfo: RunnerSystemInfo;
  connectedAt: number;
  lastSeenAt: number;
  missedPings: number;
}

export class RunnerRegistry {
  private readonly connections = new Map<string, RunnerConnection>();

  constructor(private readonly logger?: Logger) {}

  /**
   * Register a newly handshaked runner connection.
   * If a runner with the same runnerId is already connected, the existing connection
   * is replaced and closed gracefully.
   */
  register(connection: RunnerConnection): void {
    const existing = this.connections.get(connection.runnerId);
    if (existing) {
      this.logger?.warn(
        {
          event: "runner_session_replaced",
          runnerId: connection.runnerId,
          tokenId: connection.tokenRecord.id,
        },
        `Runner session for "${connection.runnerId}" replaced by a new connection`
      );

      try {
        existing.socket.close(4000, "runner_session_replaced");
      } catch {
        // Socket may already be closed
      }
    }

    this.connections.set(connection.runnerId, connection);

    this.logger?.info(
      {
        event: "runner_registered",
        runnerId: connection.runnerId,
        name: connection.name,
        platform: connection.platform,
        arch: connection.arch,
        version: connection.version,
        activeRunners: this.connections.size,
      },
      `Runner "${connection.name}" (${connection.runnerId}) registered successfully`
    );
  }

  /**
   * Unregister a runner connection.
   * Only unregisters if the socket matches the current active socket for this runnerId.
   */
  unregister(runnerId: string, socket?: WebSocket): boolean {
    const existing = this.connections.get(runnerId);
    if (!existing) return false;

    if (socket && existing.socket !== socket) {
      // Different socket (e.g. older replaced session closing)
      return false;
    }

    this.connections.delete(runnerId);

    this.logger?.info(
      {
        event: "runner_disconnected",
        runnerId,
        activeRunners: this.connections.size,
      },
      `Runner "${runnerId}" unregistered`
    );

    return true;
  }

  /**
   * Find an active runner by ID.
   */
  get(runnerId: string): RunnerConnection | undefined {
    return this.connections.get(runnerId);
  }

  /**
   * Number of active online runners.
   */
  count(): number {
    return this.connections.size;
  }

  /**
   * Get public metadata for all active runners (redacting tokens, roots, and internal state).
   */
  list(): RunnerPublic[] {
    return Array.from(this.connections.values()).map((conn) => ({
      id: conn.runnerId,
      name: conn.name,
      status: "online",
      platform: conn.platform,
      arch: conn.arch,
      version: conn.version,
      capabilities: conn.capabilities,
      connectedAt: conn.connectedAt,
      lastSeenAt: conn.lastSeenAt,
    }));
  }

  /**
   * Close all active runner connections during server shutdown.
   */
  closeAll(): void {
    for (const conn of this.connections.values()) {
      try {
        conn.socket.close(1001, "server_shutdown");
      } catch {
        // Ignore
      }
    }
    this.connections.clear();
  }
}
