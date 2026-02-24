import { execFile } from "node:child_process";
import { access, readdir, copyFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { promisify } from "node:util";
import type { SetupResult, PathConfig } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * Find 7-Zip executable. Checks common locations.
 */
export async function find7Zip(): Promise<string> {
  const candidates = [
    "7z",  // if in PATH
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe",
  ];

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--help"]);
      return candidate;
    } catch {
      // Try next
    }
  }

  throw new Error(
    "7-Zip not found. Install 7-Zip or add it to PATH.\n" +
    "Download: https://www.7-zip.org/",
  );
}

/**
 * Extract an archive to a target directory using 7-Zip.
 * Uses execFile (not exec) for shell-agnostic operation.
 */
export async function extractArchive(
  sevenZipPath: string,
  archivePath: string,
  targetDir: string,
  opts?: { overwrite?: boolean; flattenTop?: boolean },
): Promise<{ success: boolean; output: string }> {
  await mkdir(targetDir, { recursive: true });

  const args = ["x", archivePath, `-o${targetDir}`, "-y"];
  if (opts?.overwrite !== false) {
    args.push("-aoa"); // overwrite all
  }

  try {
    const { stdout, stderr } = await execFileAsync(sevenZipPath, args);
    return { success: true, output: stdout || stderr };
  } catch (err: any) {
    return { success: false, output: err.stderr || err.message };
  }
}

/**
 * Copy specific files from source directory to target directory.
 */
export async function copyFilesToDir(
  sourceDir: string,
  targetDir: string,
  filePatterns: string[],
): Promise<{ copied: string[]; missing: string[] }> {
  await mkdir(targetDir, { recursive: true });

  const copied: string[] = [];
  const missing: string[] = [];

  for (const pattern of filePatterns) {
    const sourcePath = join(sourceDir, pattern);
    try {
      await access(sourcePath);
      const targetPath = join(targetDir, basename(pattern));
      await copyFile(sourcePath, targetPath);
      copied.push(pattern);
    } catch {
      missing.push(pattern);
    }
  }

  return { copied, missing };
}

/**
 * Look for a downloaded archive in the MO2 downloads directory.
 * Searches for files matching the expected name patterns.
 */
export async function findArchiveInDownloads(
  downloadsDir: string,
  searchTerms: string[],
): Promise<string | null> {
  let files: string[] = [];
  try {
    files = await readdir(downloadsDir);
  } catch {
    return null;
  }

  const archives = files.filter((f) =>
    f.endsWith(".7z") || f.endsWith(".zip") || f.endsWith(".rar"),
  );

  for (const term of searchTerms) {
    const termLower = term.toLowerCase();
    const match = archives.find((f) => f.toLowerCase().includes(termLower));
    if (match) return join(downloadsDir, match);
  }

  return null;
}

/**
 * Execute a setup task (dry-run or real).
 */
export async function executeSetupTask(opts: {
  sevenZipPath: string;
  archivePath: string;
  targetDir: string;
  taskId: string;
  dryRun: boolean;
}): Promise<SetupResult> {
  if (opts.dryRun) {
    return {
      taskId: opts.taskId,
      success: true,
      filesExtracted: 0,
      detail: `[DRY RUN] Would extract ${basename(opts.archivePath)} → ${opts.targetDir}`,
    };
  }

  const result = await extractArchive(opts.sevenZipPath, opts.archivePath, opts.targetDir);
  return {
    taskId: opts.taskId,
    success: result.success,
    filesExtracted: result.success ? -1 : 0, // -1 = unknown count
    detail: result.success
      ? `Extracted to ${opts.targetDir}`
      : `Failed: ${result.output}`,
  };
}
