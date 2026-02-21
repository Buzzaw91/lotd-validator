import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { createLogger } from "@lexy/logger";
import { GuideManifestSchema, type GuideManifest, type GuidePage } from "@lexy/core-types";
import { parsePage } from "./parser.js";
import type { ParserDiagnostic } from "./diagnostics.js";

const log = createLogger("manifest-builder");

export interface BuildManifestOptions {
  cacheDir: string;
  outputPath: string;
}

export interface BuildManifestResult {
  manifest: GuideManifest;
  diagnostics: ParserDiagnostic[];
}

/**
 * Build a complete GuideManifest from all cached HTML pages.
 */
export async function buildManifest(
  options: BuildManifestOptions,
): Promise<BuildManifestResult> {
  const { cacheDir, outputPath } = options;

  const files = await readdir(cacheDir);
  const htmlFiles = files.filter((f) => f.endsWith(".html")).sort();

  log.info({ count: htmlFiles.length, cacheDir }, "found cached pages");

  const pages: GuidePage[] = [];
  const allDiagnostics: ParserDiagnostic[] = [];
  let orderIndex = 0;

  const manifest: GuideManifest = {
    generatedAt: new Date().toISOString(),
    pages: [],
    tasks: [],
  };

  for (const file of htmlFiles) {
    const slug = basename(file, ".html");
    const htmlPath = join(cacheDir, file);

    log.info({ slug }, "parsing page");

    const { tasks, diagnostics } = await parsePage(htmlPath, slug, orderIndex);

    pages.push({
      slug,
      title: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      sourceUrl: `https://lexyslotd.com/guide/${slug}/`,
      localPath: htmlPath,
      parsedAt: new Date().toISOString(),
    });

    manifest.tasks.push(...tasks);
    allDiagnostics.push(...diagnostics);
    orderIndex += tasks.length;
  }

  manifest.pages = pages;

  // Validate via Zod
  const validation = GuideManifestSchema.safeParse(manifest);
  if (!validation.success) {
    log.error({ errors: validation.error.issues }, "manifest validation failed");
    allDiagnostics.push({
      severity: "error",
      pageSlug: "_manifest",
      message: `Schema validation failed: ${validation.error.issues.map((i) => i.message).join("; ")}`,
    });
  }

  // Write manifest JSON
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(manifest, null, 2), "utf-8");
  log.info({ outputPath, taskCount: manifest.tasks.length }, "manifest written");

  return { manifest, diagnostics: allDiagnostics };
}
