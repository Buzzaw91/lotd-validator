import type { GuideFileEntry } from "@lexy/core-types";
import type { NexusFileInfo } from "./nexus-client.js";
import { createLogger } from "@lexy/logger";

const log = createLogger("file-matcher");

export interface MatchResult {
  status: "MATCH" | "PARTIAL" | "MISMATCH" | "ARCHIVED_REQUIRED" | "MANUAL";
  confidence: number;
  matchedFile?: NexusFileInfo;
  notes: string[];
}

/**
 * Match a guide file entry against available Nexus files.
 *
 * Matching pipeline (architecture §12.2):
 *   1. Exact nexusFileId match
 *   2. Exact filename + exact version
 *   3. Exact version + fuzzy filename
 *   4. Filename-only candidates (manual required)
 *   5. MISMATCH / MANUAL
 */
export function matchFile(
  entry: GuideFileEntry,
  nexusFiles: NexusFileInfo[],
): MatchResult {
  const notes: string[] = [];

  // ── 1. Exact fileId match ─────────────────────────────────────────
  if (entry.nexusFileId) {
    const exact = nexusFiles.find((f) => f.file_id === entry.nexusFileId);
    if (exact) {
      log.debug({ fileId: entry.nexusFileId }, "exact fileId match");
      return { status: "MATCH", confidence: 1.0, matchedFile: exact, notes: ["Exact fileId match"] };
    }
    notes.push(`fileId ${entry.nexusFileId} not found in current file list`);
  }

  // ── 2. Exact filename + exact version ─────────────────────────────
  if (entry.expectedFileName && entry.expectedVersion) {
    const exact = nexusFiles.find(
      (f) =>
        normalizeFilename(f.file_name) === normalizeFilename(entry.expectedFileName!) &&
        normalizeVersion(f.version) === normalizeVersion(entry.expectedVersion!),
    );
    if (exact) {
      return {
        status: "MATCH",
        confidence: 1.0,
        matchedFile: exact,
        notes: ["Exact filename + version match"],
      };
    }
  }

  // ── 3. Exact version + fuzzy filename ─────────────────────────────
  if (entry.expectedVersion) {
    const versionMatches = nexusFiles.filter(
      (f) => normalizeVersion(f.version) === normalizeVersion(entry.expectedVersion!),
    );

    if (versionMatches.length === 1) {
      return {
        status: "PARTIAL",
        confidence: 0.85,
        matchedFile: versionMatches[0],
        notes: ["Version match, single candidate (fuzzy filename)"],
      };
    }

    if (versionMatches.length > 1 && entry.expectedFileName) {
      // Try fuzzy filename match among version matches
      const fuzzy = versionMatches.find((f) =>
        fuzzyFilenameMatch(f.file_name, entry.expectedFileName!),
      );
      if (fuzzy) {
        return {
          status: "PARTIAL",
          confidence: 0.8,
          matchedFile: fuzzy,
          notes: ["Version match + fuzzy filename match"],
        };
      }
    }

    // Check if the version exists but is archived
    if (versionMatches.length === 0 && entry.expectedVersion) {
      notes.push(`Version ${entry.expectedVersion} not found — may be archived`);
    }
  }

  // ── 4. Filename-only candidates ───────────────────────────────────
  if (entry.expectedFileName) {
    const nameCandidates = nexusFiles.filter((f) =>
      fuzzyFilenameMatch(f.file_name, entry.expectedFileName!),
    );

    if (nameCandidates.length === 1) {
      const candidate = nameCandidates[0]!;
      const versionMismatch =
        entry.expectedVersion &&
        normalizeVersion(candidate.version) !== normalizeVersion(entry.expectedVersion);

      if (versionMismatch) {
        return {
          status: "ARCHIVED_REQUIRED",
          confidence: 0.5,
          matchedFile: candidate,
          notes: [
            `Filename match but version mismatch: expected ${entry.expectedVersion}, found ${candidate.version}`,
            "The required version may be archived on Nexus",
          ],
        };
      }

      return {
        status: "PARTIAL",
        confidence: 0.6,
        matchedFile: candidate,
        notes: ["Filename-only match, manual confirmation required"],
      };
    }

    if (nameCandidates.length > 1) {
      notes.push(`Multiple filename candidates found: ${nameCandidates.map((f) => f.file_name).join(", ")}`);
      return {
        status: "MANUAL",
        confidence: 0.3,
        notes: [...notes, "Multiple candidates — manual selection required"],
      };
    }
  }

  // ── 5. No match ──────────────────────────────────────────────────
  return {
    status: "MISMATCH",
    confidence: 0,
    notes: [...notes, "No matching file found"],
  };
}

// ── String normalization helpers ─────────────────────────────────────

function normalizeFilename(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, "").replace(/\.[^.]+$/, "");
}

function normalizeVersion(version: string): string {
  return version.toLowerCase().replace(/^v/, "").trim();
}

function fuzzyFilenameMatch(a: string, b: string): boolean {
  return normalizeFilename(a) === normalizeFilename(b);
}
