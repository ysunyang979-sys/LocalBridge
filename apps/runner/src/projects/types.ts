export interface RunnerProjectRecord {
  /**
   * Stable project identifier in format: proj_<UUIDv4>
   */
  id: string;

  /**
   * User-defined friendly name for the project
   */
  name: string;

  /**
   * User-specified input root path (Runner-private, never exposed to network)
   */
  root: string;

  /**
   * Fully-resolved real canonical directory on local filesystem (Runner-private)
   */
  canonicalRoot: string;

  /**
   * Authorization toggle (true = active, false = disabled)
   */
  enabled: boolean;

  /**
   * Timestamp in milliseconds when project was first authorized
   */
  createdAt: number;

  /**
   * Timestamp in milliseconds when project was last modified
   */
  updatedAt: number;
}

export interface ProjectStateFile {
  version: 1;
  projects: RunnerProjectRecord[];
}
