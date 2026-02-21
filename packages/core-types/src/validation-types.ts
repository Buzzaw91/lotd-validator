import { z } from "zod";

// ── Validation status ────────────────────────────────────────────────

export const ValidationStatusSchema = z.enum([
  "MATCH",
  "PARTIAL",
  "MISMATCH",
  "ARCHIVED_REQUIRED",
  "MANUAL",
]);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

// ── Single validation record (one file entry resolved) ───────────────

export const ValidationRecordSchema = z.object({
  taskId: z.string(),
  fileEntryIndex: z.number().int().nonnegative(),
  status: ValidationStatusSchema,
  confidence: z.number().min(0).max(1),
  nexusModId: z.number().int().positive().optional(),
  matchedFileId: z.number().int().positive().optional(),
  matchedFileName: z.string().optional(),
  matchedVersion: z.string().optional(),
  notes: z.array(z.string()),
});
export type ValidationRecord = z.infer<typeof ValidationRecordSchema>;

// ── Confidence helpers ───────────────────────────────────────────────

export function isExactMatch(confidence: number): boolean {
  return confidence === 1.0;
}

export function isPartialMatch(confidence: number): boolean {
  return confidence >= 0.7 && confidence < 1.0;
}

export function requiresManualSelection(confidence: number): boolean {
  return confidence < 0.7;
}
