import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@lexy/logger";

const log = createLogger("mo2-reader");

// ── Types ──────────────────────────────────────────────────────────

export interface Mo2ModEntry {
  /** Mod folder name as it appears in MO2 */
  name: string;
  /** Whether the mod is enabled (checked) in MO2 */
  enabled: boolean;
  /** Whether this entry is a separator, not a real mod */
  isSeparator: boolean;
}

export interface Mo2ModMeta {
  modId?: number;
  fileId?: number;
  version?: string;
  installedFiles?: string;
  nexusCategory?: string;
  nexusDescription?: string;
  repository?: string;
}

// ── modlist.txt parser ─────────────────────────────────────────────

/**
 * Parse MO2's `profiles/<name>/modlist.txt` into structured entries.
 *
 * Format:
 *   - Lines starting with `+` or `*` are enabled mods
 *   - Lines starting with `-` are disabled mods
 *   - Lines starting with `#` are comments
 *   - Entries ending with `_separator` are visual separators
 */
export async function readModlist(profileDir: string): Promise<Mo2ModEntry[]> {
  const filePath = join(profileDir, "modlist.txt");
  const content = await readFile(filePath, "utf-8");
  const entries: Mo2ModEntry[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const prefix = line[0];
    const name = line.slice(1);

    if (prefix !== "+" && prefix !== "*" && prefix !== "-") {
      log.debug({ line }, "skipping unrecognised modlist line");
      continue;
    }

    entries.push({
      name,
      enabled: prefix === "+" || prefix === "*",
      isSeparator: name.endsWith("_separator"),
    });
  }

  log.info(
    { profileDir, total: entries.length, enabled: entries.filter((e) => e.enabled).length },
    "parsed modlist.txt",
  );
  return entries;
}

// ── meta.ini parser ────────────────────────────────────────────────

/**
 * Read `meta.ini` for a single mod folder.
 *
 * MO2 writes an INI file in each mod folder with metadata:
 * ```
 * [General]
 * modid=12345
 * version=1.0.0
 * newestVersion=1.0.0
 * category=...
 * installationFile=SomeFile-1.0.0.zip
 * repository=Nexus
 * ```
 */
export async function readModMeta(modsDir: string, modName: string): Promise<Mo2ModMeta | undefined> {
  const metaPath = join(modsDir, modName, "meta.ini");
  let content: string;
  try {
    content = await readFile(metaPath, "utf-8");
  } catch {
    return undefined; // no meta.ini → likely a manual install or separator
  }

  const meta: Mo2ModMeta = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;

    const key = line.slice(0, eqIdx).toLowerCase();
    const value = line.slice(eqIdx + 1).trim();

    switch (key) {
      case "modid": {
        const id = parseInt(value, 10);
        if (!isNaN(id) && id > 0) meta.modId = id;
        break;
      }
      case "fileid": {
        const id = parseInt(value, 10);
        if (!isNaN(id) && id > 0) meta.fileId = id;
        break;
      }
      case "version":
        if (value) meta.version = value;
        break;
      case "installationfile":
        if (value) meta.installedFiles = value;
        break;
      case "category":
        if (value && value !== "0") meta.nexusCategory = value;
        break;
      case "repository":
        if (value) meta.repository = value;
        break;
    }
  }

  return meta;
}

// ── Mod directory scanner ──────────────────────────────────────────

/**
 * List all mod folders in the MO2 `mods/` directory.
 */
export async function listModFolders(modsDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(modsDir);
  } catch {
    return [];
  }

  const folders: string[] = [];
  for (const entry of entries) {
    const entryPath = join(modsDir, entry);
    const s = await stat(entryPath);
    if (s.isDirectory()) folders.push(entry);
  }

  return folders;
}

// ── Profile detector ───────────────────────────────────────────────

/**
 * List available MO2 profiles.
 */
export async function listProfiles(mo2Path: string): Promise<string[]> {
  const profilesDir = join(mo2Path, "profiles");
  try {
    const entries = await readdir(profilesDir);
    const profiles: string[] = [];
    for (const entry of entries) {
      const entryPath = join(profilesDir, entry);
      const s = await stat(entryPath);
      if (s.isDirectory()) profiles.push(entry);
    }
    return profiles;
  } catch {
    return [];
  }
}
