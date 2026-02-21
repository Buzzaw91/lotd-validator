// ── Guide domain types ───────────────────────────────────────────────
export {
  GuidePageSchema,
  type GuidePage,
  SourceRefSchema,
  type SourceRef,
  FomodInstructionSchema,
  type FomodInstruction,
  FileCategorySchema,
  type FileCategory,
  GuideFileEntrySchema,
  type GuideFileEntry,
  InstallModeHintSchema,
  type InstallModeHint,
  InstallTaskSchema,
  type InstallTask,
  GuideManifestSchema,
  type GuideManifest,
} from "./guide-types.js";

// ── Validation types ─────────────────────────────────────────────────
export {
  ValidationStatusSchema,
  type ValidationStatus,
  ValidationRecordSchema,
  type ValidationRecord,
  isExactMatch,
  isPartialMatch,
  requiresManualSelection,
} from "./validation-types.js";

// ── Session types ────────────────────────────────────────────────────
export {
  TaskStatusSchema,
  type TaskStatus,
  MatchedFileSchema,
  type MatchedFile,
  ConfirmationsSchema,
  type Confirmations,
  SessionTaskStateSchema,
  type SessionTaskState,
  isValidTransition,
} from "./session-types.js";

// ── Queue types ──────────────────────────────────────────────────────
export { QueueTaskSchema, type QueueTask } from "./queue-types.js";
