/** Result of a single prerequisite check */
export interface CheckResult {
  name: string;
  status: "ok" | "missing" | "warn";
  detail: string;
  category: TaskCategory;
}

/** Categories of preinstallation tasks */
export type TaskCategory =
  | "system"
  | "xedit-script"
  | "mo2-plugin"
  | "skyrim-folder"
  | "tool-profile"
  | "standalone-tool";

/** Definition of a setup task that can be checked and executed */
export interface SetupTask {
  id: string;
  name: string;
  category: TaskCategory;
  /** Nexus mod ID (if downloadable from Nexus) */
  nexusModId?: number;
  /** Strip the top-level folder if the archive only contains one folder */
  flattenTopLevel?: boolean;
  /** Specific strings to match against downloaded filenames. If omitted, uses name/checkFiles */
  archiveMatch?: string[];
  /** Description of what this task does */
  description: string;
  /** Returns the target directory for this task */
  getTargetDir: (paths: PathConfig) => string;
  /** Files/patterns to look for to verify completion */
  checkFiles: string[];
  /** Source pattern inside archive to extract */
  sourcePattern?: string[];
}

/** Resolved paths from config */
export interface PathConfig {
  toolsDir: string;
  skyrimPath?: string;
  mo2Path?: string;
  xEditDir?: string;
  mo2DownloadsDir?: string;
}

/** Full preinstall report */
export interface PreinstallReport {
  system: CheckResult[];
  tasks: CheckResult[];
  summary: { ok: number; missing: number; warn: number };
}

/** Result of a setup operation */
export interface SetupResult {
  taskId: string;
  success: boolean;
  filesExtracted: number;
  detail: string;
}
