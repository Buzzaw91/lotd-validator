import { request } from "undici";
import { writeFile, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@lexy/logger";

const log = createLogger("sync-guide");

/** Known Lexy guide page slugs — discovered from live site navigation. */
const GUIDE_PAGES = [
  "common-task-instructions",
  "preinstallation-instructions",
  "mod-installation-part-1",
  "mod-installation-part-2",
  "mod-installation-part-3",
  "mod-installation-part-4",
  "mod-installation-part-5",
  "mod-installation-part-6",
  "mod-installation-part-7",
  "mod-installation-part-8",
  "mod-installation-part-9",
  "mod-installation-part-10",
  "merge-page",
  "finishing-line",
  "mcm-setup",
];

export interface SyncGuideOptions {
  guideBaseUrl: string;
  cacheDir: string;
  /** Max age in ms before re-fetching (default: 24h) */
  maxAge?: number;
}

/**
 * Fetch all Lexy guide pages and save them as HTML files in the cache dir.
 * Skips pages that already exist and are fresh.
 */
export async function syncGuide(options: SyncGuideOptions): Promise<string[]> {
  const { guideBaseUrl, cacheDir, maxAge = 24 * 60 * 60 * 1000 } = options;
  await mkdir(cacheDir, { recursive: true });

  const savedPaths: string[] = [];

  for (const slug of GUIDE_PAGES) {
    const filePath = join(cacheDir, `${slug}.html`);

    // Check freshness
    if (await isFresh(filePath, maxAge)) {
      log.info({ slug }, "cache hit — skipping");
      savedPaths.push(filePath);
      continue;
    }

    const url = `${guideBaseUrl.replace(/\/$/, "")}/${slug}/`;
    log.info({ slug, url }, "fetching guide page");

    try {
      const res = await request(url, {
        headers: { "User-Agent": "LexyAssistant/0.1" },
      });

      if (res.statusCode !== 200) {
        log.warn({ slug, status: res.statusCode }, "non-200 response");
        continue;
      }

      const html = await res.body.text();
      await writeFile(filePath, html, "utf-8");
      log.info({ slug, bytes: html.length }, "saved");
      savedPaths.push(filePath);
    } catch (err) {
      log.error({ slug, err }, "fetch failed");
    }

    // Polite delay between requests
    await sleep(500);
  }

  return savedPaths;
}

async function isFresh(filePath: string, maxAge: number): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return Date.now() - s.mtimeMs < maxAge;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { GUIDE_PAGES };
