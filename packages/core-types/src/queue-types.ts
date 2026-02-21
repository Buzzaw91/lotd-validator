import { z } from "zod";
import type { InstallModeHint, GuideFileEntry, FomodInstruction, SourceRef } from "./guide-types.js";
import type { ValidationRecord } from "./validation-types.js";

// ── Queue task — the rendered "work item" shown to the user ──────────

export const QueueTaskSchema = z.object({
  taskId: z.string(),
  orderIndex: z.number().int().nonnegative(),
  modTitle: z.string(),
  pageSlug: z.string(),
  sectionTitle: z.string(),
  tags: z.array(z.string()),
  installModeHint: z.enum(["NEW", "MERGE", "SEPARATE", "TOOL_TASK", "MANUAL"]),
  fileEntries: z.array(z.any()), // GuideFileEntry — validated upstream
  validations: z.array(z.any()), // ValidationRecord — validated upstream
  fomod: z.array(z.any()).optional(),
  specialInstructions: z.array(z.string()).optional(),
  sourceRefs: z.array(z.any()),
  warnings: z.array(z.string()),
});

export interface QueueTask {
  taskId: string;
  orderIndex: number;
  modTitle: string;
  pageSlug: string;
  sectionTitle: string;
  tags: string[];
  installModeHint: InstallModeHint;
  fileEntries: GuideFileEntry[];
  validations: ValidationRecord[];
  fomod?: FomodInstruction[];
  specialInstructions?: string[];
  sourceRefs: SourceRef[];
  warnings: string[];
}
