import { createLogger } from "@lexy/logger";
import type { InstallTask, GuideManifest, ValidationRecord } from "@lexy/core-types";
import { NexusClient, MetadataCache, matchFile } from "@lexy/nexus-resolver";
import type { NexusFilesResponse } from "@lexy/nexus-resolver";

const log = createLogger("section-resolver");

// ── Types ──────────────────────────────────────────────────────────

export interface DownloadTarget {
  taskId: string;
  modTitle: string;
  sectionTitle: string;
  pageSlug: string;
  fileEntryIndex: number;
  nexusModId: number;
  fileId: number;
  expectedFileName?: string;
  expectedVersion?: string;
  matchedFileName?: string;
  /** Validation confidence (0-1) */
  confidence: number;
}

export interface DownloadPlan {
  sectionTitle: string;
  pageSlug: string;
  targets: DownloadTarget[];
  skippedManual: number;
  skippedNoFileId: number;
}

export interface SectionInfo {
  pageSlug: string;
  sectionTitle: string;
  taskCount: number;
  fileCount: number;
  orderIndex: number;
}

// ── Section listing ────────────────────────────────────────────────

/**
 * List all unique sections in the manifest, ordered by first appearance.
 */
export function listSections(manifest: GuideManifest): SectionInfo[] {
  const seen = new Map<string, SectionInfo>();

  for (const task of manifest.tasks) {
    const key = `${task.pageSlug}|${task.sectionTitle}`;
    const existing = seen.get(key);
    if (existing) {
      existing.taskCount++;
      existing.fileCount += task.fileEntries.length;
    } else {
      seen.set(key, {
        pageSlug: task.pageSlug,
        sectionTitle: task.sectionTitle,
        taskCount: 1,
        fileCount: task.fileEntries.length,
        orderIndex: task.orderIndex,
      });
    }
  }

  return [...seen.values()].sort((a, b) => {
    const pageOrder = a.pageSlug.localeCompare(b.pageSlug);
    return pageOrder !== 0 ? pageOrder : a.orderIndex - b.orderIndex;
  });
}

// ── Section resolution ─────────────────────────────────────────────

/**
 * Build a download plan for a specific section.
 *
 * Uses the validation report to get matched file IDs. Only includes files
 * with valid `nexusModId` and `matchedFileId`.
 */
export function buildDownloadPlan(
  manifest: GuideManifest,
  validations: ValidationRecord[],
  sectionTitle: string,
  pageSlug?: string,
): DownloadPlan {
  // Filter tasks by section (and optionally page)
  const tasks = manifest.tasks.filter((t) => {
    if (t.sectionTitle !== sectionTitle) return false;
    if (pageSlug && t.pageSlug !== pageSlug) return false;
    return true;
  });

  // Index validations by taskId + fileEntryIndex
  const validationIndex = new Map<string, ValidationRecord>();
  for (const v of validations) {
    validationIndex.set(`${v.taskId}:${v.fileEntryIndex}`, v);
  }

  const targets: DownloadTarget[] = [];
  let skippedManual = 0;
  let skippedNoFileId = 0;

  for (const task of tasks) {
    for (let i = 0; i < task.fileEntries.length; i++) {
      const entry = task.fileEntries[i]!;
      const validation = validationIndex.get(`${task.id}:${i}`);

      if (!entry.nexusModId) {
        skippedManual++;
        continue;
      }

      // Use matched fileId from validation, or fall back to manifest's nexusFileId
      const fileId = validation?.matchedFileId ?? entry.nexusFileId;

      if (!fileId) {
        skippedNoFileId++;
        log.debug(
          { taskId: task.id, fileIndex: i, modTitle: task.modTitle },
          "no fileId available (run 'lexy validate' to resolve)",
        );
        continue;
      }

      targets.push({
        taskId: task.id,
        modTitle: task.modTitle,
        sectionTitle: task.sectionTitle,
        pageSlug: task.pageSlug,
        fileEntryIndex: i,
        nexusModId: entry.nexusModId,
        fileId,
        expectedFileName: entry.expectedFileName,
        expectedVersion: entry.expectedVersion,
        matchedFileName: validation?.matchedFileName,
        confidence: validation?.confidence ?? 0,
      });
    }
  }

  const resolvedPage = pageSlug ?? tasks[0]?.pageSlug ?? "unknown";

  log.info(
    {
      sectionTitle,
      targets: targets.length,
      skippedManual,
      skippedNoFileId,
    },
    "built download plan",
  );

  return { sectionTitle, pageSlug: resolvedPage, targets, skippedManual, skippedNoFileId };
}


/**
 * Build a download plan for an entire page (all sections).
 */
export function buildPageDownloadPlan(
  manifest: GuideManifest,
  validations: ValidationRecord[],
  pageSlug: string,
): DownloadPlan {
  const tasks = manifest.tasks.filter((t) => t.pageSlug === pageSlug);
  const sections = [...new Set(tasks.map((t) => t.sectionTitle))];

  // Merge all sections into one plan
  const merged: DownloadPlan = {
    sectionTitle: `All sections on ${pageSlug}`,
    pageSlug,
    targets: [],
    skippedManual: 0,
    skippedNoFileId: 0,
  };

  for (const section of sections) {
    const plan = buildDownloadPlan(manifest, validations, section, pageSlug);
    merged.targets.push(...plan.targets);
    merged.skippedManual += plan.skippedManual;
    merged.skippedNoFileId += plan.skippedNoFileId;
  }

  return merged;
}

// ── On-the-fly file ID resolution ───────────────────────────────────

export interface ResolveOptions {
  apiKey: string;
  cacheDir: string;
  onProgress?: (current: number, total: number, modTitle: string) => void;
}

/**
 * Resolve missing file IDs in a download plan by querying the Nexus API.
 * 
 * This fixes tasks that are skipped due to `skippedNoFileId` by looking up
 * the mod's files on Nexus and matching by expectedFileName + expectedVersion.
 */
export async function resolveDownloadPlan(
  plan: DownloadPlan,
  manifest: GuideManifest,
  options: ResolveOptions,
): Promise<DownloadPlan> {
  // Find tasks that were skipped (in the section but not in targets)
  const tasksInSection = manifest.tasks.filter((t) => {
    if (t.sectionTitle !== plan.sectionTitle) return false;
    if (plan.pageSlug && plan.pageSlug !== `All sections on ${t.pageSlug}` && t.pageSlug !== plan.pageSlug) return false;
    return true;
  });

  // Find file entries that are missing from the plan
  const existingKeys = new Set(plan.targets.map((t) => `${t.taskId}:${t.fileEntryIndex}`));
  const missing: Array<{ task: InstallTask; fileIndex: number }> = [];

  for (const task of tasksInSection) {
    for (let i = 0; i < task.fileEntries.length; i++) {
      const entry = task.fileEntries[i]!;
      if (!entry.nexusModId) continue; // Skip manual entries
      if (existingKeys.has(`${task.id}:${i}`)) continue; // Already resolved
      missing.push({ task, fileIndex: i });
    }
  }

  if (missing.length === 0) return plan;

  log.info({ missingCount: missing.length }, "resolving missing file IDs via Nexus API");

  const client = new NexusClient({ apiKey: options.apiKey });
  const cache = new MetadataCache(options.cacheDir);
  const newTargets: DownloadTarget[] = [];
  let resolved = 0;

  for (const { task, fileIndex } of missing) {
    const entry = task.fileEntries[fileIndex]!;

    try {
      const cacheKey = `mod-files-${entry.nexusModId}`;
      let filesResponse = await cache.get<NexusFilesResponse>(cacheKey);
      if (!filesResponse) {
        filesResponse = await client.getModFiles(entry.nexusModId!);
        await cache.set(cacheKey, filesResponse);
      }

      const result = matchFile(entry, filesResponse.files);

      if (result.matchedFile) {
        newTargets.push({
          taskId: task.id,
          modTitle: task.modTitle,
          sectionTitle: task.sectionTitle,
          pageSlug: task.pageSlug,
          fileEntryIndex: fileIndex,
          nexusModId: entry.nexusModId!,
          fileId: result.matchedFile.file_id,
          expectedFileName: entry.expectedFileName,
          expectedVersion: entry.expectedVersion,
          matchedFileName: result.matchedFile.file_name,
          confidence: result.confidence,
        });
        resolved++;
      } else {
        log.warn(
          { taskId: task.id, modTitle: task.modTitle, expectedFileName: entry.expectedFileName },
          "could not resolve file on Nexus",
        );
      }

      options.onProgress?.(resolved, missing.length, task.modTitle);
    } catch (err) {
      log.error({ taskId: task.id, err }, "Nexus API lookup failed");
    }
  }

  log.info({ resolved, total: missing.length }, "file ID resolution complete");

  return {
    ...plan,
    targets: [...plan.targets, ...newTargets],
    skippedNoFileId: plan.skippedNoFileId - resolved,
  };
}
