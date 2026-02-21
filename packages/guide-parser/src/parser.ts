import { load as cheerioLoad, type CheerioAPI, type Cheerio } from "cheerio";
import { readFile } from "node:fs/promises";
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
 * The Lexy guide uses a custom WordPress plugin ("lotd-plus") that renders
 * mod entries in a very structured DOM.  Each mod is wrapped in a
 * `<div class="mod-item">` container with well-defined sub-elements:
 *
 *  - `h3.av-special-heading-tag`  → mod title
 *  - `div.mod-subheading`         → nexus link, version badge, author badge, tags
 *  - `div.mod-files`              → files to download (category + name + version)
 *  - `div.fomod-toggle`           → FOMOD installer instructions
 *  - `div.mod-special-instructions` → special post-install steps
 *
 * Section headings (`h2.av-special-heading-tag`) group mods into categories.
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

  // Track the current h2 section title
  let currentSection = "Unknown Section";

  // Walk all content in order: detect section headings and mod-item blocks.
  // Section headings are h2 elements inside `.av-special-heading-h2`.
  $("h2.av-special-heading-tag").each((_i, el) => {
    const heading = $(el).text().trim();
    if (heading) currentSection = heading;
  });

  // The primary extraction target: every div.mod-item in the page.
  const modItems = $("div.mod-item");
  log.debug({ pageSlug, modItemCount: modItems.length }, "found mod-items");

  modItems.each((_i, el) => {
    const $mod = $(el);

    // ── Mod title ──────────────────────────────────────────────────────
    const modTitle = $mod.find("h3.av-special-heading-tag").first().text().trim();
    if (!modTitle) {
      diagnostics.push({
        severity: "warn",
        pageSlug,
        message: `mod-item at position ${_i} has no h3 title`,
      });
      return; // skip un-parseable entries
    }

    // ── Determine which section this mod belongs to ────────────────────
    // Walk backwards through preceding siblings / parents to find the
    // closest h2 heading.  Because mod-items are inside code-block
    // sections which are siblings of h2 headings.
    const sectionTitle = findParentSectionTitle($, $mod) || currentSection;

    // ── Nexus link & badges from .mod-subheading ───────────────────────
    const $subheading = $mod.find("div.mod-subheading").first();
    const nexusLink = $subheading.find('a[href*="nexusmods.com"]').first().attr("href") ?? undefined;
    const nexusIds = nexusLink ? parseNexusUrl(nexusLink) : undefined;

    // Version from badge img src (e.g. "Version-1.11-informational")
    const versionBadge = extractBadgeValue($, $subheading, "Version");

    // ── Tags from .mod-tags ────────────────────────────────────────────
    const tags = extractTags($, $subheading);

    // ── File entries from .mod-files ───────────────────────────────────
    const fileEntries = extractFileEntries($, $mod, nexusIds, diagnostics, pageSlug, modTitle);

    if (fileEntries.length === 0) {
      diagnostics.push({
        severity: "info",
        pageSlug,
        message: `mod "${modTitle}" has no downloadable file entries`,
      });
    }

    // ── FOMOD instructions ─────────────────────────────────────────────
    const fomod = extractFomodInstructions($, $mod);

    // ── Special instructions ───────────────────────────────────────────
    const specialInstructions = extractSpecialInstructions($, $mod);

    // ── Install mode hint ──────────────────────────────────────────────
    const installModeHint = determineInstallMode(fileEntries);

    // ── Build the anchor ID (e.g. #address-library-for-skse-plugins) ──
    const anchorId = $mod.find(".av-special-heading").first().attr("id") ?? undefined;

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
      sourceRefs: [
        {
          pageSlug,
          locatorText: anchorId ?? modTitle,
        },
      ],
    };

    tasks.push(task);
    orderIndex++;
  });

  log.info({ pageSlug, taskCount: tasks.length }, "parsed page");
  return { tasks, diagnostics };
}

// ── Internal helpers ─────────────────────────────────────────────────

/**
 * Walk previous siblings / ancestors to locate the nearest h2 section heading.
 */
function findParentSectionTitle($: CheerioAPI, $mod: Cheerio<any>): string | undefined {
  // Mod-items live inside avia_codeblock_section → flex_column → etc.
  // The h2 is a sibling of the code-block wrapper at the same level.
  // Walk up to the nearest `av_one_full` or `avia_codeblock_section` and
  // then check previous siblings for h2.
  let $cursor = $mod.closest(".avia_codeblock_section, .av_one_full, [class*='flex_column']");
  let limit = 20;

  while ($cursor.length > 0 && limit-- > 0) {
    // Check all previous siblings for h2 headings
    let $prev = $cursor.prev();
    while ($prev.length > 0) {
      const h2 = $prev.find("h2.av-special-heading-tag").text().trim();
      if (h2) return h2;
      // Also check if the element itself is an h2 wrapper
      if ($prev.hasClass("av-special-heading-h2")) {
        const directH2 = $prev.find("h2").text().trim();
        if (directH2) return directH2;
      }
      $prev = $prev.prev();
    }
    // Go one level up and keep searching
    $cursor = $cursor.parent();
  }

  return undefined;
}

/**
 * Extract a badge value from shields.io img src URLs.
 * e.g. `img[src*="shields.io/badge/Version-1.11-informational"]` → "1.11"
 */
function extractBadgeValue($: CheerioAPI, $container: Cheerio<any>, label: string): string | undefined {
  let value: string | undefined;
  $container.find("img").each((_i, el) => {
    const src = $(el).attr("src") ?? "";
    // Pattern: /badge/Label-Value-color.svg
    const regex = new RegExp(`badge/${label}-([^-]+)`, "i");
    const match = src.match(regex);
    if (match) {
      value = decodeURIComponent(match[1]!.replace(/\.svg$/, "")).trim();
    }
  });
  return value;
}

/**
 * Extract tags from `.mod-tags` badge searchable spans.
 */
function extractTags($: CheerioAPI, $subheading: Cheerio<any>): string[] {
  const tags: string[] = [];
  $subheading.find("span.mod-tags span.lotd-shield-searchable").each((_i, el) => {
    const text = $(el).text().trim();
    if (text) tags.push(text);
  });
  return tags;
}

/**
 * Extract file entries from .mod-files blocks inside a mod-item.
 * Each file entry has:
 *  - `.mod-file-item-category`  → file category (Main Files, Update Files, etc.)
 *  - `.mod-file-item-name`      → expected file name
 *  - `.mod-file-item-version`   → expected version
 */
function extractFileEntries(
  $: CheerioAPI,
  $mod: Cheerio<any>,
  nexusIds: { modId: number; fileId?: number } | undefined,
  diagnostics: ParserDiagnostic[],
  pageSlug: string,
  modTitle: string,
): GuideFileEntry[] {
  const entries: GuideFileEntry[] = [];

  $mod.find("span.mod-file-item").each((_i, el) => {
    const $item = $(el);

    // Category text, e.g. "Main Files", "Update Files", "Optional Files"
    const categoryText = $item.find(".mod-file-item-category").text().trim();
    const fileCategory = mapFileCategory(categoryText);

    // File name
    const fileName = $item.find(".mod-file-item-name").text().trim();

    // Version (strip the "Version:" label)
    const versionEl = $item.find(".mod-file-item-version");
    let version: string | undefined;
    if (versionEl.length > 0) {
      // Remove the label span text
      const labelText = versionEl.find(".mod-file-item-version-label").text();
      version = versionEl.text().replace(labelText, "").trim() || undefined;
    }

    // Nexus source URL from the parent mod's download link
    const sourceUrl = $mod.find('div.mod-subheading a[href*="nexusmods.com"]').first().attr("href") ?? undefined;

    entries.push({
      fileCategory,
      labelText: `${categoryText} — ${fileName}`.substring(0, 500),
      expectedFileName: fileName || undefined,
      expectedVersion: version,
      sourceUrl,
      nexusModId: nexusIds?.modId,
      nexusFileId: nexusIds?.fileId,
    });
  });

  return entries;
}

/**
 * Map the guide's category labels to our FileCategory enum.
 */
function mapFileCategory(text: string): FileCategory {
  const lower = text.toLowerCase();
  if (lower.includes("main")) return "MAIN";
  if (lower.includes("update")) return "UPDATE";
  if (lower.includes("optional")) return "OPTIONAL";
  if (lower.includes("miscellaneous") || lower.includes("misc")) return "MISC";
  if (lower.includes("old")) return "OLD";
  return "UNKNOWN";
}

/**
 * Extract FOMOD instructions from the fomod-toggle carousel.
 *
 * Structure:
 *   div.fomod-toggle
 *     div.fomod-carousel
 *       div.fomod-page-wrapper
 *         div.fomod-page-label  → page name
 *         div.fomod-page-content
 *           fieldset.fomod-section
 *             legend.fomod-section-label → section name
 *             div.fomod-item → selection (checked = selected)
 */
function extractFomodInstructions($: CheerioAPI, $mod: Cheerio<any>): FomodInstruction[] {
  const instructions: FomodInstruction[] = [];

  $mod.find("div.fomod-toggle div.fomod-page-wrapper").each((_i, el) => {
    const $page = $(el);
    const pageLabel = $page.find(".fomod-page-label").text().trim();

    const selections: string[] = [];

    $page.find("fieldset.fomod-section").each((_j, sectionEl) => {
      const $section = $(sectionEl);
      const sectionLabel = $section.find("legend.fomod-section-label").text().trim();

      $section.find("div.fomod-item").each((_k, itemEl) => {
        const $item = $(itemEl);
        // Check if this option is selected (has checked attribute)
        const isChecked = $item.find("input[checked]").length > 0;
        if (isChecked) {
          // Get the text content (excluding the input element)
          const itemText = $item.text().trim();
          selections.push(`[${sectionLabel}] ${itemText}`);
        }
      });
    });

    if (selections.length > 0) {
      instructions.push({
        stepLabel: pageLabel,
        selections,
      });
    }
  });

  return instructions;
}

/**
 * Extract special instructions from `.mod-special-instructions`.
 */
function extractSpecialInstructions($: CheerioAPI, $mod: Cheerio<any>): string[] {
  const instructions: string[] = [];

  $mod.find("div.mod-special-instructions span.mod-instructions").each((_i, el) => {
    const html = $(el).html() ?? "";
    // Convert inner HTML to readable text, preserving list structure
    const text = $(el).text().trim();
    if (text.length > 5) {
      instructions.push(text);
    }
  });

  return [...new Set(instructions)];
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

  if (hasMain && hasUpdate) return "MERGE";
  if (hasMain) return "NEW";
  if (hasUpdate) return "MERGE";
  if (hasOptional) return "SEPARATE";
  return "NEW"; // default
}
