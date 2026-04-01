import { createLogger } from "@lexy/logger";
import type { InstallTask, GuideManifest } from "@lexy/core-types";
import type { Mo2ModEntry, Mo2ModMeta } from "./mo2-reader";

const log = createLogger("mo2-matcher");

// ── Types ──────────────────────────────────────────────────────────

export interface MatchedTask {
  taskId: string;
  modTitle: string;
  mo2ModName: string;
  nexusModId?: number;
  installedVersion?: string;
  expectedVersion?: string;
  matchMethod: "nexus_id" | "name_exact" | "name_fuzzy";
  versionMatch: boolean;
}

export interface ObserverSnapshot {
  profileName: string;
  mo2Path: string;
  timestamp: string;
  installedModCount: number;
  separatorCount: number;
  matchedTasks: MatchedTask[];
  unmatchedMods: string[];
  missingTasks: MissingTask[];
}

export interface MissingTask {
  taskId: string;
  modTitle: string;
  sectionTitle: string;
  nexusModId?: number;
}

// ── Matcher ────────────────────────────────────────────────────────

export interface InstalledMod {
  entry: Mo2ModEntry;
  meta?: Mo2ModMeta;
}

/**
 * Cross-reference MO2 installed mods against the guide manifest.
 *
 * Matching strategy (in priority order):
 *   1. Nexus mod ID (from meta.ini) matches task.fileEntries[].nexusModId
 *   2. Exact mod folder name matches task.modTitle (case-insensitive)
 *   3. Fuzzy name match (normalized, stripped of version suffixes)
 */
export function matchModsToTasks(
  installedMods: InstalledMod[],
  manifest: GuideManifest,
  profileName: string,
  mo2Path: string,
): ObserverSnapshot {
  const matchedTasks: MatchedTask[] = [];
  const matchedTaskIds = new Set<string>();
  const matchedModNames = new Set<string>();

  // Build lookup indices
  const tasksByNexusId = new Map<number, InstallTask[]>();
  const tasksByNormalizedTitle = new Map<string, InstallTask[]>();

  for (const task of manifest.tasks) {
    // Index by Nexus mod IDs from file entries
    for (const entry of task.fileEntries) {
      if (entry.nexusModId) {
        const existing = tasksByNexusId.get(entry.nexusModId) ?? [];
        existing.push(task);
        tasksByNexusId.set(entry.nexusModId, existing);
      }
    }

    // Index by normalized title
    const normalized = normalizeName(task.modTitle);
    const existing = tasksByNormalizedTitle.get(normalized) ?? [];
    existing.push(task);
    tasksByNormalizedTitle.set(normalized, existing);
  }

  // Match each installed mod
  for (const mod of installedMods) {
    if (mod.entry.isSeparator) continue;

    let matched = false;

    // Strategy 1: Match by Nexus mod ID
    if (mod.meta?.modId) {
      const tasks = tasksByNexusId.get(mod.meta.modId);
      if (tasks && tasks.length > 0) {
        for (const task of tasks) {
          if (matchedTaskIds.has(task.id)) continue;

          const expectedVersion = getExpectedVersion(task);
          const versionMatch = !expectedVersion || !mod.meta.version || versionsMatch(mod.meta.version, expectedVersion);

          matchedTasks.push({
            taskId: task.id,
            modTitle: task.modTitle,
            mo2ModName: mod.entry.name,
            nexusModId: mod.meta.modId,
            installedVersion: mod.meta.version,
            expectedVersion,
            matchMethod: "nexus_id",
            versionMatch,
          });

          matchedTaskIds.add(task.id);
          matchedModNames.add(mod.entry.name);
          matched = true;
          break; // one mod → one task
        }
      }
    }
    if (matched) continue;

    // Strategy 2: Exact name match (case-insensitive)
    const normalizedModName = normalizeName(mod.entry.name);
    const exactTasks = tasksByNormalizedTitle.get(normalizedModName);
    if (exactTasks) {
      for (const task of exactTasks) {
        if (matchedTaskIds.has(task.id)) continue;

        const expectedVersion = getExpectedVersion(task);
        const versionMatch = !expectedVersion || !mod.meta?.version || versionsMatch(mod.meta.version, expectedVersion);

        matchedTasks.push({
          taskId: task.id,
          modTitle: task.modTitle,
          mo2ModName: mod.entry.name,
          nexusModId: mod.meta?.modId,
          installedVersion: mod.meta?.version,
          expectedVersion,
          matchMethod: "name_exact",
          versionMatch,
        });

        matchedTaskIds.add(task.id);
        matchedModNames.add(mod.entry.name);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Strategy 3: Fuzzy name match
    const fuzzyMatch = findFuzzyMatch(normalizedModName, manifest.tasks, matchedTaskIds);
    if (fuzzyMatch) {
      const expectedVersion = getExpectedVersion(fuzzyMatch);
      const versionMatch = !expectedVersion || !mod.meta?.version || versionsMatch(mod.meta.version, expectedVersion);

      matchedTasks.push({
        taskId: fuzzyMatch.id,
        modTitle: fuzzyMatch.modTitle,
        mo2ModName: mod.entry.name,
        nexusModId: mod.meta?.modId,
        installedVersion: mod.meta?.version,
        expectedVersion,
        matchMethod: "name_fuzzy",
        versionMatch,
      });

      matchedTaskIds.add(fuzzyMatch.id);
      matchedModNames.add(mod.entry.name);
      matched = true;
    }

    if (!matched) {
      log.debug({ modName: mod.entry.name, nexusModId: mod.meta?.modId }, "no manifest match");
    }
  }

  // Build unmatched lists
  const VANILLA_PREFIXES = ['DLC:', 'Creation Club:', 'cc'];
  const KNOWN_GUIDE_MODS = [
    'cleaned vanilla esms',
    'bashed patch',
    'unmanaged: bashed patch',
    'smashed patch',
    'unmanaged: smashed patch',
    'overwrite',
  ];
  const unmatchedMods = installedMods
    .filter((m) => !m.entry.isSeparator && !matchedModNames.has(m.entry.name))
    .map((m) => m.entry.name)
    .filter((name) => {
      if (VANILLA_PREFIXES.some((p) => name.startsWith(p))) return false;
      if (KNOWN_GUIDE_MODS.some((k) => name.toLowerCase().includes(k))) return false;
      return true;
    });

  const missingTasks: MissingTask[] = manifest.tasks
    .filter((t) => !matchedTaskIds.has(t.id))
    .map((t) => ({
      taskId: t.id,
      modTitle: t.modTitle,
      sectionTitle: t.sectionTitle,
      nexusModId: t.fileEntries[0]?.nexusModId,
    }));

  const separatorCount = installedMods.filter((m) => m.entry.isSeparator).length;

  log.info(
    {
      matched: matchedTasks.length,
      unmatched: unmatchedMods.length,
      missing: missingTasks.length,
    },
    "matching complete",
  );

  return {
    profileName,
    mo2Path,
    timestamp: new Date().toISOString(),
    installedModCount: installedMods.filter((m) => !m.entry.isSeparator).length,
    separatorCount,
    matchedTasks,
    unmatchedMods,
    missingTasks,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Normalize a mod name for matching: lowercase, strip common suffixes
 * like version numbers, "SSE", "SE", dashes, underscores → spaces.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s*\(.*?\)\s*/g, " ") // remove parenthesized content
    .replace(/\s*v?\d+(\.\d+)*\s*$/g, "") // strip trailing version
    .replace(/\bsse\b/g, "")
    .replace(/\bse\b/g, "")
    .replace(/\bng\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find a fuzzy match by checking if one name contains the other
 * or if they share enough words.
 */
function findFuzzyMatch(
  normalizedModName: string,
  tasks: InstallTask[],
  matched: Set<string>,
): InstallTask | undefined {
  const modWords = normalizedModName.split(" ").filter((w) => w.length > 2);
  if (modWords.length === 0) return undefined;

  let bestTask: InstallTask | undefined;
  let bestScore = 0;

  for (const task of tasks) {
    if (matched.has(task.id)) continue;

    const normalizedTitle = normalizeName(task.modTitle);

    // Check containment
    if (normalizedTitle.includes(normalizedModName) || normalizedModName.includes(normalizedTitle)) {
      const score = Math.min(normalizedTitle.length, normalizedModName.length) / Math.max(normalizedTitle.length, normalizedModName.length);
      if (score > bestScore && score > 0.5) {
        bestScore = score;
        bestTask = task;
      }
    }

    // Check word overlap
    const titleWords = normalizedTitle.split(" ").filter((w) => w.length > 2);
    if (titleWords.length === 0) continue;

    const common = modWords.filter((w) => titleWords.includes(w));
    const overlapScore = common.length / Math.max(modWords.length, titleWords.length);

    if (overlapScore > bestScore && overlapScore > 0.6) {
      bestScore = overlapScore;
      bestTask = task;
    }
  }

  return bestTask;
}

function getExpectedVersion(task: InstallTask): string | undefined {
  return task.fileEntries[0]?.expectedVersion;
}

function versionsMatch(installed: string, expected: string): boolean {
  // Normalize versions: strip leading "v", trim whitespace, strip trailing .0 segments
  const norm = (v: string) => {
    let n = v.replace(/^v/i, "").trim();
    // Strip trailing .0 segments: "3.2.0.0" → "3.2", "1.0.0" → "1"
    n = n.replace(/(\.0)+$/, "");
    return n;
  };
  const a = norm(installed);
  const b = norm(expected);

  // Exact match after normalization
  if (a === b) return true;

  // One version starts with the other (e.g. installed "1.1" starts with expected "1")
  // This handles the case where MO2 picks up the UPDATE file version
  if (a.startsWith(b + ".") || b.startsWith(a + ".")) return true;

  // SKSE-style date versions (dYYYY.M.DD.N) should not flag a mismatch
  // against short semver versions — the user just renamed the archive
  if (/^d\d{4}\.\d+\.\d+/.test(a) || /^d\d{4}\.\d+\.\d+/.test(b)) {
    return true;
  }

  return false;
}
