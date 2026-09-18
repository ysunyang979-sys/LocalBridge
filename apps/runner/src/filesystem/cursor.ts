import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";

export interface PaginationState {
  offset: number;
}

/**
 * Encode pagination offset into an opaque base64url token.
 */
export function encodeCursor(offset: number): string {
  const payload = JSON.stringify({ offset });
  return Buffer.from(payload, "utf-8").toString("base64url");
}

/**
 * Decode opaque base64url cursor into offset.
 * Throws INVALID_CURSOR if token is malformed, invalid base64url, or tampered with.
 */
export function decodeCursor(cursor?: string | null): number {
  if (!cursor) {
    return 0;
  }

  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.offset !== "number" ||
      !Number.isInteger(parsed.offset) ||
      parsed.offset < 0
    ) {
      throw new Error("Malformed cursor payload");
    }

    return parsed.offset;
  } catch {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.INVALID_CURSOR,
      "Invalid or malformed pagination cursor"
    );
  }
}
