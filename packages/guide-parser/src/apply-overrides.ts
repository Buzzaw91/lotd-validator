import { createLogger } from "@lexy/logger";
import type { InstallTask, VersionOverride } from "@lexy/core-types";

const log = createLogger("apply-overrides");

export interface AppliedOverride {
  modTitle: string;
  taskId: string;
  originalVersion: string | undefined;
  newVersion: string;
  reason: string | undefined;
}

export interface OverrideResult {
  tasks: InstallTask[];
  applied: AppliedOverride[];
}

/**
 * Apply version overrides to parsed tasks.
 *
 * Matching is case-insensitive substring on `modTitle`.
 * All `fileEntries` of a matched task have their `expectedVersion` replaced.
 */
export function applyOverrides(
  tasks: InstallTask[],
  overrides: VersionOverride[],
): OverrideResult {
  if (overrides.length === 0) {
    return { tasks, applied: [] };
  }

  const applied: AppliedOverride[] = [];

  const patchedTasks = tasks.map((task) => {
    for (const override of overrides) {
      if (task.modTitle.toLowerCase().includes(override.modTitle.toLowerCase())) {
        // Clone the task with patched file entries
        const patchedEntries = task.fileEntries.map((entry) => ({
          ...entry,
          expectedVersion: override.expectedVersion,
        }));

        applied.push({
          modTitle: task.modTitle,
          taskId: task.id,
          originalVersion: task.fileEntries[0]?.expectedVersion,
          newVersion: override.expectedVersion,
          reason: override.reason,
        });

        log.info(
          {
            modTitle: task.modTitle,
            from: task.fileEntries[0]?.expectedVersion,
            to: override.expectedVersion,
          },
          "version override applied",
        );

        return { ...task, fileEntries: patchedEntries };
      }
    }
    return task;
  });

  return { tasks: patchedTasks, applied };
}
