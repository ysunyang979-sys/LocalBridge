import type { GitDiffParams, GitDiffResult } from "@localbridge/protocol";
import type { GitService } from "../../git/index.js";

export function createGitDiffHandler(gitService: GitService) {
  return async (params: GitDiffParams): Promise<GitDiffResult> => {
    return gitService.getDiff(params);
  };
}
