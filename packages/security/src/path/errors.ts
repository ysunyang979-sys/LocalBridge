import { LocalBridgeErrorCode, LocalBridgeError } from "@localbridge/protocol";

export class SecurityPathError extends LocalBridgeError {
  constructor(
    code: LocalBridgeErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = "SecurityPathError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
