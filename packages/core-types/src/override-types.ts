import { z } from "zod";

// ── Version Override ─────────────────────────────────────────────────

export const VersionOverrideSchema = z.object({
  /** Case-insensitive substring match against InstallTask.modTitle */
  modTitle: z.string().min(1),
  /** The version to force for all file entries of the matched task */
  expectedVersion: z.string().min(1),
  /** Human-readable reason for this override (shown in CLI output) */
  reason: z.string().optional(),
});
export type VersionOverride = z.infer<typeof VersionOverrideSchema>;

export const VersionOverridesFileSchema = z.array(VersionOverrideSchema);
export type VersionOverridesFile = z.infer<typeof VersionOverridesFileSchema>;
