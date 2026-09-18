import crypto from "node:crypto";

/**
 * Compute sha256:<hex> hash of a buffer or string.
 */
export function computeSha256(content: string | Buffer): string {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `sha256:${hash}`;
}
