import type {
  DirectoryListParams,
  DirectoryListResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";

export function createDirectoryListHandler(fsService: FilesystemService) {
  return async (params: DirectoryListParams): Promise<DirectoryListResult> => {
    return fsService.listDirectory(params);
  };
}
