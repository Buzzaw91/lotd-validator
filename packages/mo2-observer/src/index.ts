import { join } from "node:path";
import { createLogger } from "@lexy/logger";
import type { GuideManifest } from "@lexy/core-types";
import { readModlist, readModMeta, listModFolders, listProfiles } from "./mo2-reader";
import { matchModsToTasks, type ObserverSnapshot, type InstalledMod } from "./matcher";

const log = createLogger("mo2-observer");

export { readModlist, readModMeta, listModFolders, listProfiles } from "./mo2-reader";
export { matchModsToTasks } from "./matcher";
export type {
  Mo2ModEntry,
  Mo2ModMeta,
} from "./mo2-reader";
export type {
  MatchedTask,
  ObserverSnapshot,
  MissingTask,
  InstalledMod,
} from "./matcher";

/**
 * Create a snapshot comparing MO2 installed mods against a guide manifest.
 *
 * @param mo2Path  Path to the MO2 portable instance root
 * @param profileName  Profile to inspect (e.g. "Default")
 * @param manifest  Parsed guide manifest
 */
export async function createSnapshot(
  mo2Path: string,
  profileName: string,
  manifest: GuideManifest,
): Promise<ObserverSnapshot> {
  const profileDir = join(mo2Path, "profiles", profileName);
  const modsDir = join(mo2Path, "mods");

  log.info({ mo2Path, profileName }, "creating MO2 observer snapshot");

  // 1. Read the modlist
  const modlistEntries = await readModlist(profileDir);

  // 2. Read meta.ini for each mod folder (even if not in modlist)
  const modFolders = await listModFolders(modsDir);
  const modlistNames = new Set(modlistEntries.map((e) => e.name));

  // Build installed mods list from modlist entries
  const installedMods: InstalledMod[] = [];

  for (const entry of modlistEntries) {
    if (entry.isSeparator) {
      installedMods.push({ entry, meta: undefined });
      continue;
    }

    const meta = await readModMeta(modsDir, entry.name);
    installedMods.push({ entry, meta });
  }

  // Also pick up mods that exist in the mods/ folder but aren't in the modlist
  for (const folder of modFolders) {
    if (modlistNames.has(folder)) continue;
    const meta = await readModMeta(modsDir, folder);
    installedMods.push({
      entry: { name: folder, enabled: false, isSeparator: false },
      meta,
    });
  }

  // 3. Match against manifest
  return matchModsToTasks(installedMods, manifest, profileName, mo2Path);
}

/**
 * Format an observer snapshot for CLI output.
 */
export function formatSnapshot(snapshot: ObserverSnapshot): string {
  const lines: string[] = [];

  lines.push(`\n🔍 MO2 Observer Snapshot`);
  lines.push(`   Profile: ${snapshot.profileName}`);
  lines.push(`   Path: ${snapshot.mo2Path}`);
  lines.push(`   Time: ${snapshot.timestamp}`);
  lines.push(``);
  lines.push(`📊 Summary`);
  lines.push(`   Installed mods: ${snapshot.installedModCount}`);
  lines.push(`   Separators: ${snapshot.separatorCount}`);
  lines.push(`   Matched tasks: ${snapshot.matchedTasks.length}`);
  lines.push(`   Unmatched MO2 mods: ${snapshot.unmatchedMods.length}`);
  lines.push(`   Missing from MO2: ${snapshot.missingTasks.length}`);

  // Match breakdown by method
  const byMethod = { nexus_id: 0, name_exact: 0, name_fuzzy: 0 };
  let versionMismatches = 0;
  for (const m of snapshot.matchedTasks) {
    byMethod[m.matchMethod]++;
    if (!m.versionMatch) versionMismatches++;
  }

  lines.push(``);
  lines.push(`🔗 Match Methods`);
  lines.push(`   Nexus ID: ${byMethod.nexus_id}`);
  lines.push(`   Exact name: ${byMethod.name_exact}`);
  lines.push(`   Fuzzy name: ${byMethod.name_fuzzy}`);
  if (versionMismatches > 0) {
    lines.push(`   ⚠️  Version mismatches: ${versionMismatches}`);
  }

  // Show unmatched mods (first 20)
  if (snapshot.unmatchedMods.length > 0) {
    lines.push(``);
    lines.push(`❓ Unmatched MO2 Mods (not in guide):`);
    const show = snapshot.unmatchedMods.slice(0, 20);
    for (const name of show) {
      lines.push(`   • ${name}`);
    }
    if (snapshot.unmatchedMods.length > 20) {
      lines.push(`   ... and ${snapshot.unmatchedMods.length - 20} more`);
    }
  }

  // Version mismatches detail
  const mismatches = snapshot.matchedTasks.filter((m) => !m.versionMatch);
  if (mismatches.length > 0) {
    lines.push(``);
    lines.push(`⚠️  Version Mismatches:`);
    for (const m of mismatches.slice(0, 15)) {
      lines.push(`   • ${m.modTitle}: installed ${m.installedVersion ?? "?"} ≠ expected ${m.expectedVersion ?? "?"}`);
    }
    if (mismatches.length > 15) {
      lines.push(`   ... and ${mismatches.length - 15} more`);
    }
  }

  return lines.join("\n");
}
