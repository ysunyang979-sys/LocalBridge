export const RunnerMethod = {
  RUNNER_HELLO: "runner.hello",
  SYSTEM_INFO: "system.info",
  PROJECT_VALIDATE: "project.validate",
  DIRECTORY_LIST: "directory.list",
  FILE_READ: "file.read",
  FILE_CREATE: "file.create",
  FILE_WRITE: "file.write",
  FILE_PATCH: "file.patch",
  FILE_DELETE: "file.delete",
  FILE_SEARCH: "file.search",
  TEXT_SEARCH: "text.search",
  SHELL_RUN: "shell.run",
  GIT_STATUS: "git.status",
  GIT_DIFF: "git.diff",
  GIT_LOG: "git.log",
  JOB_START: "job.start",
  JOB_STATUS: "job.status",
  JOB_LOGS: "job.logs",
  JOB_CANCEL: "job.cancel",
} as const;

export type RunnerMethod = (typeof RunnerMethod)[keyof typeof RunnerMethod];
