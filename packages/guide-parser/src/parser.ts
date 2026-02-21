import { load as cheerioLoad, type CheerioAPI, type Cheerio } from "cheerio";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createLogger } from "@lexy/logger";
import type {
  InstallTask,
  GuideFileEntry,
  FomodInstruction,
  FileCategory,
  InstallModeHint,
} from "@lexy/core-types";
import type { ParserDiagnostic } from "./diagnostics";

const log = createLogger("guide-parser");

export interface ParseResult {
  tasks: InstallTask[];
  diagnostics: ParserDiagnostic[];
}

/**
 * Parse a single cached HTML guide page into InstallTask[].
 *
 * The parser is deliberately rule-based (CSS selectors + text patterns)
 * so it stays deterministic and testable.
 *
 * NOTE: The exact selectors below are a *best-effort first pass*. After
 * fetching real snapshots we'll refine them against the actual markup.
 */
export async function parsePage(
  htmlPath: string,
  pageSlug: string,
  startOrderIndex: number,
): Promise<ParseResult> {
  const html = await readFile(htmlPath, "utf-8");
  return parseHtml(html, pageSlug, startOrderIndex);
}

export function parseHtml(
  html: string,
  pageSlug: string,
  startOrderIndex: number,
): ParseResult {
  const $ = cheerioLoad(html);
  const diagnostics: ParserDiagnostic[] = [];
  const tasks: InstallTask[] = [];

  let orderIndex = startOrderIndex;

  // The Lexy guide uses a WordPress theme. Mod entries are typically
  // rendered in content sections. We'll look for common patterns:
  //   - <h3> or <h2> section headers
  //   - Mod "cards" or table rows with download links
  //
  // This initial implementation scans for links to nexusmods.com as
  // anchor points, then works outward to find mod context.

  // Strategy: find all section headings, then within each section
  // look for file entries / nexus links.

  const headings = $("h2, h3");

  headings.each((_i, el) => {
    const $heading = $(el);
    const sectionTitle = $heading.text().trim();
    if (!sectionTitle) return;

    // Collect all content between this heading and the next heading
    const sectionContent = collectSectionContent($, $heading);

    // Find nexus links in section
    const nexusLinks = sectionContent.find('a[href*="nexusmods.com"]');
    if (nexusLinks.length === 0) return;

    // Try to extract mod title — use heading or first strong/bold text
    const modTitle = sectionTitle;

    // Extract file entries from the section
    const fileEntries = extractFileEntries($, sectionContent, diagnostics, pageSlug);
    if (fileEntries.length === 0) {
      // Attempt basic extraction from links only
      const basicEntries = extractBasicFileEntries($, nexusLinks);
      if (basicEntries.length === 0) return;
      fileEntries.push(...basicEntries);
    }

    // Determine install mode hint
    const installModeHint = determineInstallMode(fileEntries);

    // Extract FOMOD instructions
    const fomod = extractFomodInstructions($, sectionContent);

    // Extract special instructions
    const specialInstructions = extractSpecialInstructions($, sectionContent);

    // Extract tags
    const tags = extractTags($, sectionContent);

    const task: InstallTask = {
      id: `${pageSlug}-${orderIndex}`,
      orderIndex,
      pageSlug,
      sectionTitle,
      modTitle,
      tags,
      fileEntries,
      fomod: fomod.length > 0 ? fomod : undefined,
      specialInstructions: specialInstructions.length > 0 ? specialInstructions : undefined,
      installModeHint,
      sourceRefs: [{ pageSlug, locatorText: sectionTitle }],
    };

    tasks.push(task);
    orderIndex++;
  });

  log.info({ pageSlug, taskCount: tasks.length }, "parsed page");
  return { tasks, diagnostics };
}

// ── Internal helpers ─────────────────────────────────────────────────

function collectSectionContent($: CheerioAPI, $heading: Cheerio<any>): Cheerio<any> {
  const elements: any[] = [];
  let $next = $heading.next();

  while ($next.length > 0 && !$next.is("h2, h3")) {
    elements.push($next[0]!);
    $next = $next.next();
  }

  return $(elements);
}

function extractFileEntries(
  $: CheerioAPI,
  $section: Cheerio<any>,
  diagnostics: ParserDiagnostic[],
  pageSlug: string,
): GuideFileEntry[] {
  const entries: GuideFileEntry[] = [];

  // Look for common patterns:
  // "Main Files — <filename> <version>"
  // "Update Files — <filename> <version>"
  // etc.
  const categoryPatterns: Array<{ pattern: RegExp; category: FileCategory }> = [
    { pattern: /main\s+files?/i, category: "MAIN" },
    { pattern: /update\s+files?/i, category: "UPDATE" },
    { pattern: /optional\s+files?/i, category: "OPTIONAL" },
    { pattern: /miscellaneous\s+files?/i, category: "MISC" },
    { pattern: /old\s+files?/i, category: "OLD" },
  ];

  // Scan text nodes and list items for file references
  $section.find("li, p, td").each((_i, el) => {
    const text = $(el).text().trim();
    if (!text) return;

    let category: FileCategory = "UNKNOWN";
    for (const cp of categoryPatterns) {
      if (cp.pattern.test(text)) {
        category = cp.category;
        break;
      }
    }

    // Look for nexus link within this element
    const $link = $(el).find('a[href*="nexusmods.com"]');
    const sourceUrl = $link.length > 0 ? $link.attr("href") : undefined;

    // Try to extract nexus mod ID from URL
    const nexusIds = sourceUrl ? parseNexusUrl(sourceUrl) : undefined;

    // Try to extract version text (common patterns: "v1.2.3", "1.2.3", "Version 1.2.3")
    const versionMatch = text.match(/(?:v(?:ersion)?\s*)?(\d+\.\d+(?:\.\d+)*(?:\s*[a-zA-Z]*)?)/i);
    const expectedVersion = versionMatch ? versionMatch[1]!.trim() : undefined;

    // Skip if we couldn't extract anything meaningful
    if (!sourceUrl && category === "UNKNOWN") return;

    entries.push({
      fileCategory: category,
      labelText: text.substring(0, 200), // cap label length
      expectedFileName: $link.length > 0 ? $link.text().trim() : undefined,
      expectedVersion,
      sourceUrl,
      nexusModId: nexusIds?.modId,
      nexusFileId: nexusIds?.fileId,
    });
  });

  return entries;
}

function extractBasicFileEntries(
  $: CheerioAPI,
  $links: Cheerio<any>,
): GuideFileEntry[] {
  const entries: GuideFileEntry[] = [];

  $links.each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().trim();
    const nexusIds = parseNexusUrl(href);

    entries.push({
      fileCategory: "MAIN",
      labelText: text || href,
      expectedFileName: text || undefined,
      sourceUrl: href,
      nexusModId: nexusIds?.modId,
      nexusFileId: nexusIds?.fileId,
    });
  });

  return entries;
}

function parseNexusUrl(url: string): { modId: number; fileId?: number } | undefined {
  // Nexus URL patterns:
  //  https://www.nexusmods.com/skyrimspecialedition/mods/12345
  //  https://www.nexusmods.com/skyrimspecialedition/mods/12345?tab=files&file_id=67890
  const modMatch = url.match(/nexusmods\.com\/[^/]+\/mods\/(\d+)/);
  if (!modMatch) return undefined;

  const modId = parseInt(modMatch[1]!, 10);
  const fileMatch = url.match(/file_id=(\d+)/);
  const fileId = fileMatch ? parseInt(fileMatch[1]!, 10) : undefined;

  return { modId, fileId };
}

function determineInstallMode(entries: GuideFileEntry[]): InstallModeHint {
  if (entries.length === 0) return "MANUAL";

  const hasMain = entries.some((e) => e.fileCategory === "MAIN");
  const hasUpdate = entries.some((e) => e.fileCategory === "UPDATE");
  const hasOptional = entries.some(
    (e) => e.fileCategory === "OPTIONAL" || e.fileCategory === "MISC" || e.fileCategory === "OLD",
  );

  if (hasMain) return "NEW";
  if (hasUpdate) return "MERGE";
  if (hasOptional) return "SEPARATE";
  return "NEW"; // default
}

function extractFomodInstructions(
  $: CheerioAPI,
  $section: Cheerio<any>,
): FomodInstruction[] {
  const fomod: FomodInstruction[] = [];

  // Look for FOMOD-related text blocks (often in bullet lists or tables)
  const fomodHeader = $section.find(":contains('FOMOD')").first();
  if (fomodHeader.length === 0) return fomod;

  // Try to parse selections from subsequent list items
  const $list = fomodHeader.nextAll("ul, ol").first();
  if ($list.length > 0) {
    const selections: string[] = [];
    $list.find("li").each((_i, el) => {
      selections.push($(el).text().trim());
    });
    if (selections.length > 0) {
      fomod.push({ selections });
    }
  }

  return fomod;
}

function extractSpecialInstructions(
  $: CheerioAPI,
  $section: Cheerio<any>,
): string[] {
  const instructions: string[] = [];

  // Look for special instruction blocks (often in alert/note boxes or bold text)
  $section.find(":contains('Special Instructions'), :contains('Note:'), :contains('Important:')").each(
    (_i, el) => {
      const text = $(el).text().trim();
      if (text.length > 10 && text.length < 2000) {
        instructions.push(text);
      }
    },
  );

  // Deduplicate
  return [...new Set(instructions)];
}

function extractTags($: CheerioAPI, $section: Cheerio<any>): string[] {
  const tags: string[] = [];

  // Look for ESL, ESPFE, ESM markers
  const text = $section.text();
  if (/\bESL\b/.test(text)) tags.push("ESL");
  if (/\bESPFE\b/.test(text)) tags.push("ESPFE");
  if (/\bESM\b/.test(text)) tags.push("ESM");
  if (/\bESP\b/.test(text)) tags.push("ESP");

  return tags;
}
