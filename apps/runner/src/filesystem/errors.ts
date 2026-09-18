import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";

/**
 * Translates low-level Node.js filesystem errors into sanitized LocalBridge errors,
 * ensuring no absolute paths, drive letters, or usernames leak to remote clients.
 */
export function sanitizeFsError(err: unknown, defaultMessage = "Filesystem error"): never {
  if (err instanceof LocalBridgeError) {
    throw err;
  }

  const nodeErr = err as NodeJS.ErrnoException;
  if (nodeErr && typeof nodeErr.code === "string") {
    switch (nodeErr.code) {
      case "ENOENT":
        throw new LocalBridgeError(
          LocalBridgeErrorCode.FILE_NOT_FOUND,
          "Target file or directory does not exist"
        );
      case "ENOTDIR":
        throw new LocalBridgeError(
          LocalBridgeErrorCode.NOT_A_DIRECTORY,
          "Target path is not a directory"
        );
      case "EISDIR":
        throw new LocalBridgeError(
          LocalBridgeErrorCode.FILE_NOT_REGULAR,
          "Target path is a directory, not a regular file"
        );
      case "EACCES":
      case "EPERM":
        throw new LocalBridgeError(
          LocalBridgeErrorCode.FILE_ACCESS_DENIED,
          "Permission denied accessing target"
        );
      default:
        break;
    }
  }

  throw new LocalBridgeError(
    LocalBridgeErrorCode.INTERNAL_ERROR,
    defaultMessage
  );
}
