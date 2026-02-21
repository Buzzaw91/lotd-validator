import { z } from "zod";

// ── Task status enum ─────────────────────────────────────────────────

export const TaskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "done",
  "blocked",
  "skipped",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// ── Matched file record (stored per-file within a session task) ──────

export const MatchedFileSchema = z.object({
  fileEntryIndex: z.number().int().nonnegative(),
  localArchivePath: z.string().optional(),
  localHash: z.string().optional(),
  nexusFileId: z.number().int().positive().optional(),
  version: z.string().optional(),
});
export type MatchedFile = z.infer<typeof MatchedFileSchema>;

// ── User confirmations ──────────────────────────────────────────────

export const ConfirmationsSchema = z.object({
  fomodCompleted: z.boolean().optional(),
  specialInstructionsCompleted: z.boolean().optional(),
});
export type Confirmations = z.infer<typeof ConfirmationsSchema>;

// ── Session-level task state ─────────────────────────────────────────

export const SessionTaskStateSchema = z.object({
  taskId: z.string(),
  status: TaskStatusSchema,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  matchedFiles: z.array(MatchedFileSchema).optional(),
  confirmations: ConfirmationsSchema.optional(),
  notes: z.array(z.string()).optional(),
});
export type SessionTaskState = z.infer<typeof SessionTaskStateSchema>;

// ── Allowed state transitions ────────────────────────────────────────

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "skipped"],
  in_progress: ["done", "blocked"],
  done: [],
  blocked: ["in_progress"],
  skipped: ["in_progress"],
};

export function isValidTransition(
  from: TaskStatus,
  to: TaskStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
