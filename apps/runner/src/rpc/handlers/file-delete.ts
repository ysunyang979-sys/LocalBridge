import type {
  FileDeleteParams,
  FileDeleteResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";

export function createFileDeleteHandler(fsService: FilesystemService) {
  return async (params: FileDeleteParams): Promise<FileDeleteResult> => {
    return fsService.deleteFile(params);
  };
}
