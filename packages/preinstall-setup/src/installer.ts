import { execFile } from "node:child_process";
import { access, readdir, copyFile, mkdir, rm, cp } from "node:fs/promises";
import { join, basename } from "node:path";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import glob from "fast-glob";
import type { SetupResult, PathConfig, SetupTask } from "./types.js";

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
 * Executes a file setup task by extracting the archive to a temporary directory,
 * stripping wrapping folders if needed, applying glob patterns, and copying
 * strictly matched items to the final directory.
 */
export async function executeSetupTask(opts: {
  sevenZipPath: string;
  archivePath: string;
  targetDir: string;
  task: SetupTask;
  dryRun: boolean;
}): Promise<SetupResult> {
  if (opts.dryRun) {
    return {
      taskId: opts.task.id,
      success: true,
      filesExtracted: 0,
      detail: `[DRY RUN] Would extract ${basename(opts.archivePath)} → ${opts.targetDir}`,
    };
  }

  const tempId = `lexy-setup-${opts.task.id}-${Date.now()}`;
  const tempExtractDir = join(tmpdir(), tempId);
  await mkdir(tempExtractDir, { recursive: true });

  try {
    const extractRes = await extractArchive(opts.sevenZipPath, opts.archivePath, tempExtractDir);
    if (!extractRes.success) {
      return {
        taskId: opts.task.id,
        success: false,
        filesExtracted: 0,
        detail: `Extraction failed: ${extractRes.output}`,
      };
    }

    let actualRoot = tempExtractDir;
    if (opts.task.flattenTopLevel) {
      const contents = await readdir(actualRoot, { withFileTypes: true });
      if (contents.length === 1 && contents[0].isDirectory()) {
        actualRoot = join(actualRoot, contents[0].name);
      }
    }

    const patterns = opts.task.sourcePattern && opts.task.sourcePattern.length > 0
      ? opts.task.sourcePattern
      : ["*"];

    // fast-glob requires forward slashes
    const matchBase = actualRoot.replace(/\\/g, "/");
    const globPatterns = patterns.map((p) => join(matchBase, p).replace(/\\/g, "/"));

    const matchedPaths = await glob(globPatterns, {
      onlyFiles: false, 
      absolute: true
    });

    if (matchedPaths.length === 0) {
      return {
        taskId: opts.task.id,
        success: false,
        filesExtracted: 0,
        detail: `No files matching pattern "${patterns.join(", ")}" found in archive.`,
      };
    }

    await mkdir(opts.targetDir, { recursive: true });
    let copied = 0;

    for (const match of matchedPaths) {
      // Return to OS-specific path separators
      const srcPath = match.replace(/\//g, "\\");
      // Map matched basename to target dir directly
      const destPath = join(opts.targetDir, basename(srcPath));

      await cp(srcPath, destPath, { recursive: true, force: true });
      copied++;
    }

    return {
      taskId: opts.task.id,
      success: true,
      filesExtracted: copied,
      detail: `Extracted to ${opts.targetDir}`,
    };
  } catch (err: any) {
    return {
      taskId: opts.task.id,
      success: false,
      filesExtracted: 0,
      detail: err.message,
    };
  } finally {
    // Cleanup temporary extraction root
    await rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
  }
}
