import { request } from "undici";
import { createWriteStream } from "node:fs";
import { writeFile, access, readdir, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createLogger } from "@lexy/logger";
import { NexusClient, MetadataCache, matchFile } from "@lexy/nexus-resolver";
import type { NexusFilesResponse } from "@lexy/nexus-resolver";
import type { DownloadTarget, DownloadPlan } from "./section-resolver";
import type { GuideManifest, GuideFileEntry } from "@lexy/core-types";

const log = createLogger("downloader");

// ── Types ──────────────────────────────────────────────────────────

export interface DownloadOptions {
  /** MO2 downloads directory */
  downloadsDir: string;
  /** NexusClient instance (authenticated) */
  client: NexusClient;
  /** Skip files already in downloadsDir */
  skipExisting: boolean;
  /** Progress callback */
  onProgress?: (event: DownloadProgressEvent) => void;
  /** Guide manifest — needed for 404 retry resolution */
  manifest?: GuideManifest;
  /** Nexus cache directory — needed for 404 retry resolution */
  cacheDir?: string;
}

export interface DownloadProgressEvent {
  target: DownloadTarget;
  status: "downloading" | "complete" | "skipped" | "error";
  current: number;
  total: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
  error?: string;
}

export interface DownloadResult {
  completed: DownloadTarget[];
  skipped: DownloadTarget[];
  failed: { target: DownloadTarget; error: string }[];
}

// ── Downloader ─────────────────────────────────────────────────────

/**
 * Execute a download plan — fetches files from Nexus CDN and saves
 * them to the MO2 downloads directory with .meta sidecars.
 */
export async function executeDownloads(
  plan: DownloadPlan,
  options: DownloadOptions,
): Promise<DownloadResult> {
  const { downloadsDir, client, skipExisting, onProgress } = options;

  await mkdir(downloadsDir, { recursive: true });

  const result: DownloadResult = {
    completed: [],
    skipped: [],
    failed: [],
  };

  // Get existing files for skip-check
  const existingFiles = new Set<string>();
  if (skipExisting) {
    try {
      const files = await readdir(downloadsDir);
      for (const f of files) existingFiles.add(f.toLowerCase());
    } catch {
      // empty dir
    }
  }

  const total = plan.targets.length;

  for (let i = 0; i < plan.targets.length; i++) {
    const target = plan.targets[i]!;

    // Check if already downloaded
    const expectedName = target.matchedFileName ?? target.expectedFileName;
    if (skipExisting && expectedName && existingFiles.has(expectedName.toLowerCase())) {
      log.debug({ file: expectedName }, "skipping existing file");
      onProgress?.({
        target,
        status: "skipped",
        current: i + 1,
        total,
      });
      result.skipped.push(target);
      continue;
    }

    onProgress?.({
      target,
      status: "downloading",
      current: i + 1,
      total,
    });

    try {
      await downloadSingleFile(target, client, downloadsDir, (bytesDownloaded, bytesTotal) => {
        onProgress?.({
          target,
          status: "downloading",
          current: i + 1,
          total,
          bytesDownloaded,
          bytesTotal,
        });
      });
      result.completed.push(target);

      onProgress?.({
        target,
        status: "complete",
        current: i + 1,
        total,
      });
    } catch (err) {
      const errorMsg = (err as Error).message;

      // If 404 and we have manifest context, try re-resolving the file ID
      if (errorMsg.includes('404') && options.manifest && options.cacheDir) {
        log.info({ modTitle: target.modTitle }, "404 — attempting fresh file ID resolution");
        onProgress?.({
          target: { ...target },
          status: "downloading",
          current: i + 1,
          total,
        });

        const resolved = await tryResolveAndRetry(target, options, downloadsDir, (bytesDownloaded, bytesTotal) => {
          onProgress?.({
            target,
            status: "downloading",
            current: i + 1,
            total,
            bytesDownloaded,
            bytesTotal,
          });
        });

        if (resolved) {
          result.completed.push(target);
          onProgress?.({
            target,
            status: "complete",
            current: i + 1,
            total,
          });
          continue;
        }
      }

      log.error({ target: target.taskId, modTitle: target.modTitle, error: errorMsg }, "download failed");
      result.failed.push({ target, error: errorMsg });

      onProgress?.({
        target,
        status: "error",
        current: i + 1,
        total,
        error: errorMsg,
      });
    }
  }

  return result;
}

// ── Single file download ───────────────────────────────────────────

async function downloadSingleFile(
  target: DownloadTarget,
  client: NexusClient,
  downloadsDir: string,
  onByteProgress?: (bytesDownloaded: number, bytesTotal: number) => void,
): Promise<void> {
  // 1. Get download links from Nexus API (premium)
  const links = await client.getDownloadLinks(target.nexusModId, target.fileId);
  if (!links || links.length === 0) {
    throw new Error(`No download links returned for mod ${target.nexusModId} file ${target.fileId}`);
  }

  // Pick first CDN (usually the preferred one)
  const cdnUrl = links[0]!.URI;
  log.info(
    { modTitle: target.modTitle, fileId: target.fileId, cdn: links[0]!.short_name },
    "downloading",
  );

  // 2. Stream download to disk
  const res = await request(cdnUrl);

  if (res.statusCode !== 200) {
    throw new Error(`CDN returned ${res.statusCode} for ${cdnUrl}`);
  }

  // Determine filename from Content-Disposition or fallback to matchedFileName
  let fileName = target.matchedFileName ?? target.expectedFileName ?? `${target.nexusModId}-${target.fileId}`;

  const disposition = res.headers["content-disposition"];
  if (typeof disposition === "string") {
    const match = disposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/i);
    if (match?.[1]) {
      fileName = decodeURIComponent(match[1]);
    }
  }

  // Ensure it has an extension
  if (!fileName.includes(".")) {
    fileName += ".7z";
  }

  const filePath = join(downloadsDir, fileName);

  // Track download bytes for progress reporting
  const contentLength = parseInt(res.headers["content-length"] as string, 10) || 0;
  let bytesDownloaded = 0;
  let lastProgressAt = 0;

  const progressTracker = new Transform({
    transform(chunk, _encoding, callback) {
      bytesDownloaded += chunk.length;
      const now = Date.now();
      // Throttle progress updates to every 250ms
      if (onByteProgress && (now - lastProgressAt > 250 || bytesDownloaded === contentLength)) {
        lastProgressAt = now;
        onByteProgress(bytesDownloaded, contentLength);
      }
      callback(null, chunk);
    },
  });

  const writeStream = createWriteStream(filePath);
  await pipeline(res.body, progressTracker, writeStream);

  log.info({ fileName, filePath }, "file downloaded");

  // 3. Write .meta sidecar for MO2
  const metaContent = [
    "[General]",
    "gameName=SkyrimSE",
    `modID=${target.nexusModId}`,
    `fileID=${target.fileId}`,
    "url=",
    `modName=${target.modTitle}`,
    `version=${target.expectedVersion ?? ""}`,
    "newestVersion=",
    "category=",
    "repository=Nexus",
    "",
  ].join("\n");

  await writeFile(`${filePath}.meta`, metaContent, "utf-8");
  log.debug({ metaPath: `${filePath}.meta` }, "wrote .meta sidecar");
}

// ── 404 auto-retry with fresh resolution ────────────────────────────

/**
 * When a download returns 404 (stale file ID), re-resolve the file by
 * fetching the mod's current file list and matching fresh.
 */
async function tryResolveAndRetry(
  target: DownloadTarget,
  options: DownloadOptions,
  downloadsDir: string,
  onByteProgress?: (bytesDownloaded: number, bytesTotal: number) => void,
): Promise<boolean> {
  if (!options.manifest || !options.cacheDir) return false;

  try {
    // Find the original file entry from the manifest
    const task = options.manifest.tasks.find((t) => t.id === target.taskId);
    if (!task) return false;
    const entry = task.fileEntries[target.fileEntryIndex];
    if (!entry || !entry.nexusModId) return false;

    // Force-refresh the file listing (bypass cache)
    const filesResponse = await options.client.getModFiles(entry.nexusModId);
    const cache = new MetadataCache(options.cacheDir);
    await cache.set(`mod-files-${entry.nexusModId}`, filesResponse);

    const result = matchFile(entry, filesResponse.files);
    if (!result.matchedFile) {
      log.warn({ modTitle: target.modTitle }, "re-resolution found no match");
      return false;
    }

    // Update the target with the fresh file ID
    const newFileId = result.matchedFile.file_id;
    if (newFileId === target.fileId) {
      log.warn({ modTitle: target.modTitle, fileId: newFileId }, "re-resolved same file ID — still stale");
      return false;
    }

    log.info(
      { modTitle: target.modTitle, oldFileId: target.fileId, newFileId, matchedName: result.matchedFile.file_name },
      "re-resolved to new file ID",
    );

    // Mutate the target with the new ID and retry
    target.fileId = newFileId;
    target.matchedFileName = result.matchedFile.file_name;

    await downloadSingleFile(target, options.client, downloadsDir, onByteProgress);
    return true;
  } catch (retryErr) {
    log.error({ modTitle: target.modTitle, error: (retryErr as Error).message }, "retry after re-resolution failed");
    return false;
  }
}

/**
 * Format a download result for CLI output.
 */
export function formatDownloadResult(result: DownloadResult, plan: DownloadPlan): string {
  const lines: string[] = [];

  lines.push(``);
  lines.push(`📥 Download Complete: ${plan.sectionTitle}`);
  lines.push(`   ✅ Downloaded: ${result.completed.length}`);
  lines.push(`   ⏭️  Skipped:    ${result.skipped.length}`);
  lines.push(`   ❌ Failed:     ${result.failed.length}`);

  if (plan.skippedManual > 0) {
    lines.push(`   🔧 Manual:     ${plan.skippedManual} (no Nexus ID)`);
  }
  if (plan.skippedNoFileId > 0) {
    lines.push(`   ⚠️  No file ID: ${plan.skippedNoFileId} (run validate first)`);
  }

  if (result.failed.length > 0) {
    lines.push(``);
    lines.push(`Failed downloads:`);
    for (const f of result.failed) {
      lines.push(`   ❌ ${f.target.modTitle}: ${f.error}`);
    }
  }

  return lines.join("\n");
}
