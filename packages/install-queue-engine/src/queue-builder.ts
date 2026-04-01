import type { InstallTask, ValidationRecord, QueueTask, FileCategory, InstallModeHint } from "@lexy/core-types";
import { createLogger } from "@lexy/logger";

const log = createLogger("queue-builder");

const CATEGORY_TO_MODE: Record<FileCategory, InstallModeHint> = {
  MAIN: "NEW",
  UPDATE: "MERGE",
  OPTIONAL: "SEPARATE",
  MISC: "SEPARATE",
  OLD: "SEPARATE",
  UNKNOWN: "NEW",
};

/**
 * Convert parsed tasks + validation records into an ordered install queue.
 */
export function buildQueue(
  tasks: InstallTask[],
  validations: ValidationRecord[],
): QueueTask[] {
  // Index validations by taskId for fast lookup
  const validationsByTask = new Map<string, ValidationRecord[]>();
  for (const v of validations) {
    const list = validationsByTask.get(v.taskId) ?? [];
    list.push(v);
    validationsByTask.set(v.taskId, list);
  }

  const queue: QueueTask[] = tasks
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((task) => {
      const taskValidations = validationsByTask.get(task.id) ?? [];
      const warnings: string[] = [];

      // Collect warnings from validations
      for (const v of taskValidations) {
        if (v.status === "ARCHIVED_REQUIRED") {
          warnings.push(`⚠️ Archived file required for entry ${v.fileEntryIndex}`);
        } else if (v.status === "MISMATCH") {
          warnings.push(`❌ No matching file for entry ${v.fileEntryIndex}`);
        } else if (v.status === "MANUAL") {
          warnings.push(`🔧 Manual verification needed for entry ${v.fileEntryIndex}`);
        }
      }

      return {
        taskId: task.id,
        orderIndex: task.orderIndex,
        modTitle: task.modTitle,
        pageSlug: task.pageSlug,
        sectionTitle: task.sectionTitle,
        tags: task.tags,
        installModeHint: task.installModeHint,
        fileEntries: task.fileEntries,
        validations: taskValidations,
        fomod: task.fomod,
        specialInstructions: task.specialInstructions,
        sourceRefs: task.sourceRefs,
        warnings,
      };
    });

  log.info({ queueLength: queue.length }, "queue built");
  return queue;
}
