import { EventEmitter } from "node:events";

const HEADER_DELIMITER = Buffer.from("\r\n\r\n", "ascii");
const CONTENT_LENGTH_REGEX = /content-length:\s*(\d+)/i;

export interface LspMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Encodes a JSON-RPC message into LSP stream wire format:
 * Content-Length: <byteLength>\r\n\r\n<JSON>
 */
export function formatLspMessage(msg: LspMessage | Record<string, unknown>): Buffer {
  const json = JSON.stringify(msg);
  const payloadBuffer = Buffer.from(json, "utf-8");
  const header = `Content-Length: ${payloadBuffer.length}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, "ascii"), payloadBuffer]);
}

/**
 * Stream parser that extracts LSP framed messages from incoming byte buffers.
 */
export class LspStreamParser extends EventEmitter {
  private buffer = Buffer.alloc(0);

  /**
   * Feed new incoming chunk from stream
   */
  feed(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.processBuffer();
  }

  private processBuffer(): void {
    while (true) {
      const delimiterIndex = this.buffer.indexOf(HEADER_DELIMITER);
      if (delimiterIndex === -1) {
        // Incomplete headers, wait for more data
        break;
      }

      const headerText = this.buffer.subarray(0, delimiterIndex).toString("ascii");
      const match = CONTENT_LENGTH_REGEX.exec(headerText);
      if (!match) {
        // Malformed header, discard up to delimiter + 4 to avoid infinite loop
        this.emit("error", new Error(`Malformed LSP header: ${headerText}`));
        this.buffer = this.buffer.subarray(delimiterIndex + HEADER_DELIMITER.length);
        continue;
      }

      const contentLength = parseInt(match[1]!, 10);
      const totalMessageLength = delimiterIndex + HEADER_DELIMITER.length + contentLength;

      if (this.buffer.length < totalMessageLength) {
        // Incomplete payload, wait for more chunks
        break;
      }

      const payloadBuffer = this.buffer.subarray(
        delimiterIndex + HEADER_DELIMITER.length,
        totalMessageLength
      );

      // Advance buffer
      this.buffer = this.buffer.subarray(totalMessageLength);

      try {
        const payloadText = payloadBuffer.toString("utf-8");
        const parsed = JSON.parse(payloadText) as LspMessage;
        this.emit("message", parsed);
      } catch (err) {
        this.emit("error", new Error(`Failed to parse LSP JSON payload: ${String(err)}`));
      }
    }
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}
