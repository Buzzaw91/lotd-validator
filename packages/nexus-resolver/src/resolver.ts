import type { GuideManifest, ValidationRecord } from "@lexy/core-types";
import { createLogger } from "@lexy/logger";
import { NexusClient, type NexusFilesResponse } from "./nexus-client.js";
import { MetadataCache } from "./metadata-cache.js";
import { matchFile } from "./file-matcher.js";

const log = createLogger("resolver");

export interface ResolverOptions {
  apiKey: string;
  cacheDir: string;
}

/**
 * Resolve and validate all file entries in a GuideManifest against
 * the Nexus Mods API. Produces a ValidationRecord per file entry.
 */
export async function resolveManifest(
  manifest: GuideManifest,
  options: ResolverOptions,
): Promise<ValidationRecord[]> {
  const client = new NexusClient({ apiKey: options.apiKey });
  const cache = new MetadataCache(options.cacheDir);
  const records: ValidationRecord[] = [];

  for (const task of manifest.tasks) {
    for (let i = 0; i < task.fileEntries.length; i++) {
      const entry = task.fileEntries[i]!;

      // Skip entries without a Nexus mod ID
      if (!entry.nexusModId) {
        records.push({
          taskId: task.id,
          fileEntryIndex: i,
          status: "MANUAL",
          confidence: 0,
          notes: ["No Nexus mod ID — manual verification required"],
        });
        continue;
      }

      try {
        // Check cache first
        const cacheKey = `mod-files-${entry.nexusModId}`;
        let filesResponse = await cache.get<NexusFilesResponse>(cacheKey);

        if (!filesResponse) {
          filesResponse = await client.getModFiles(entry.nexusModId);
          await cache.set(cacheKey, filesResponse);
        }

        const result = matchFile(entry, filesResponse.files);

        records.push({
          taskId: task.id,
          fileEntryIndex: i,
          status: result.status,
          confidence: result.confidence,
          nexusModId: entry.nexusModId,
          matchedFileId: result.matchedFile?.file_id,
          matchedFileName: result.matchedFile?.file_name,
          matchedVersion: result.matchedFile?.version,
          notes: result.notes,
        });

        log.info(
          {
            taskId: task.id,
            modId: entry.nexusModId,
            status: result.status,
            confidence: result.confidence,
          },
          "resolved file entry",
        );
      } catch (err) {
        log.error({ taskId: task.id, modId: entry.nexusModId, err }, "resolution failed");
        records.push({
          taskId: task.id,
          fileEntryIndex: i,
          status: "MANUAL",
          confidence: 0,
          nexusModId: entry.nexusModId,
          notes: [`Resolution failed: ${err instanceof Error ? err.message : String(err)}`],
        });
      }
    }
  }

  return records;
}
