import type {
  AIClientType,
  AIConnectionCategory,
  ConnectionHealthDto,
  TestConnectionResult,
} from "@localbridge/protocol";
import type { ConnectionService } from "../db/connection-service.js";
import type { McpContext } from "../mcp/context.js";

export interface AIClientAdapter {
  readonly id: string;
  readonly clientType: AIClientType;
  readonly name: string;
  readonly category: AIConnectionCategory;

  getHealth(): Promise<ConnectionHealthDto>;
  testConnection(): Promise<TestConnectionResult>;
}

export abstract class BaseAIAdapter implements AIClientAdapter {
  constructor(
    public readonly id: string,
    public readonly clientType: AIClientType,
    public readonly name: string,
    public readonly category: AIConnectionCategory,
    protected readonly connectionService: ConnectionService,
    protected readonly mcpContext: McpContext
  ) {}

  abstract getHealth(): Promise<ConnectionHealthDto>;
  abstract testConnection(): Promise<TestConnectionResult>;
}
