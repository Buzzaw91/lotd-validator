import { z } from "zod";

// ── Guide page metadata ──────────────────────────────────────────────

export const GuidePageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  sourceUrl: z.string().url(),
  localPath: z.string(),
  parsedAt: z.string().datetime(),
});
export type GuidePage = z.infer<typeof GuidePageSchema>;

// ── Source reference (back-link to guide) ────────────────────────────

export const SourceRefSchema = z.object({
  pageSlug: z.string(),
  locatorText: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

// ── FOMOD instruction block ──────────────────────────────────────────

export const FomodInstructionSchema = z.object({
  stepLabel: z.string().optional(),
  selections: z.array(z.string()),
});
export type FomodInstruction = z.infer<typeof FomodInstructionSchema>;

// ── Individual file entry within a mod task ──────────────────────────

export const FileCategorySchema = z.enum([
  "MAIN",
  "UPDATE",
  "OPTIONAL",
  "MISC",
  "OLD",
  "UNKNOWN",
]);
export type FileCategory = z.infer<typeof FileCategorySchema>;

export const GuideFileEntrySchema = z.object({
  fileCategory: FileCategorySchema,
  labelText: z.string(),
  expectedFileName: z.string().optional(),
  expectedVersion: z.string().optional(),
  sourceUrl: z.string().optional(),
  nexusModId: z.number().int().positive().optional(),
  nexusFileId: z.number().int().positive().optional(),
});
export type GuideFileEntry = z.infer<typeof GuideFileEntrySchema>;

// ── Install mode hint ────────────────────────────────────────────────

export const InstallModeHintSchema = z.enum([
  "NEW",
  "MERGE",
  "SEPARATE",
  "TOOL_TASK",
  "MANUAL",
]);
export type InstallModeHint = z.infer<typeof InstallModeHintSchema>;

// ── Single install task (one mod card from the guide) ────────────────

export const InstallTaskSchema = z.object({
  id: z.string(),
  orderIndex: z.number().int().nonnegative(),
  pageSlug: z.string(),
  sectionTitle: z.string(),
  modTitle: z.string(),
  tags: z.array(z.string()),
  fileEntries: z.array(GuideFileEntrySchema),
  fomod: z.array(FomodInstructionSchema).optional(),
  specialInstructions: z.array(z.string()).optional(),
  installModeHint: InstallModeHintSchema,
  sourceRefs: z.array(SourceRefSchema),
});
export type InstallTask = z.infer<typeof InstallTaskSchema>;

// ── Complete guide manifest ──────────────────────────────────────────

export const GuideManifestSchema = z.object({
  generatedAt: z.string().datetime(),
  guideVersionLabel: z.string().optional(),
  pages: z.array(GuidePageSchema),
  tasks: z.array(InstallTaskSchema),
});
export type GuideManifest = z.infer<typeof GuideManifestSchema>;
