import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@lexy/logger";

const log = createLogger("metadata-cache");

export interface CacheEntry<T> {
  data: T;
  fetchedAt: string;
}

/**
 * Simple on-disk JSON cache for Nexus API responses.
 * Each mod gets its own file: `<cacheDir>/<modId>.json`
 */
export class MetadataCache {
  private cacheDir: string;
  private ttlMs: number;

  constructor(cacheDir: string, ttlMs: number = 7 * 24 * 60 * 60 * 1000) {
    this.cacheDir = cacheDir;
    this.ttlMs = ttlMs;
  }

  async get<T>(key: string): Promise<T | null> {
    const filePath = join(this.cacheDir, `${key}.json`);
    try {
      const raw = await readFile(filePath, "utf-8");
      const entry: CacheEntry<T> = JSON.parse(raw);

      const age = Date.now() - new Date(entry.fetchedAt).getTime();
      if (age > this.ttlMs) {
        log.debug({ key }, "cache expired");
        return null;
      }

      log.debug({ key }, "cache hit");
      return entry.data;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, data: T): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const entry: CacheEntry<T> = {
      data,
      fetchedAt: new Date().toISOString(),
    };
    const filePath = join(this.cacheDir, `${key}.json`);
    await writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
    log.debug({ key }, "cache set");
  }
}
