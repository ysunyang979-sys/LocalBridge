import type {
  FileCreateParams,
  FileCreateResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";

export function createFileCreateHandler(fsService: FilesystemService) {
  return async (params: FileCreateParams): Promise<FileCreateResult> => {
    return fsService.createFile(params);
  };
}
