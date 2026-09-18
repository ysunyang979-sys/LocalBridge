import type { GitStatusParams, GitStatusResult } from "@localbridge/protocol";
import type { GitService } from "../../git/index.js";

export function createGitStatusHandler(gitService: GitService) {
  return async (params: GitStatusParams): Promise<GitStatusResult> => {
    return gitService.getStatus(params);
  };
}
