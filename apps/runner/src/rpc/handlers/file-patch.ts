import type {
  FilePatchParams,
  FilePatchResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";

export function createFilePatchHandler(fsService: FilesystemService) {
  return async (params: FilePatchParams): Promise<FilePatchResult> => {
    return fsService.patchFile(params);
  };
}
