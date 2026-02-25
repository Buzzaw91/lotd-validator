import { createLogger } from "@lexy/logger";
import type { GuideManifest, InstallTask } from "@lexy/core-types";

const log = createLogger("manifest-differ");

export interface ManifestDiff {
  /** Tasks present in the new manifest but not in the old manifest */
  added: InstallTask[];
  
  /** Tasks removed from the new manifest that were present in the old manifest */
  removed: InstallTask[];
  
  /** Tasks where the ID matched, but the expected version or nexus file ID changed */
  updated: {
    oldTask: InstallTask;
    newTask: InstallTask;
    changes: string[]; // Descriptions of what changed (e.g., "Version changed from 1.0 to 2.0")
  }[];
  
  /** Tasks that remained identical */
  unchanged: InstallTask[];
}

/**
 * Compares an existing manifest against a newly parsed manifest to determine updates.
 */
export function diffManifests(
  oldManifest: GuideManifest | null,
  newManifest: GuideManifest
): ManifestDiff {
  if (!oldManifest) {
    log.info("No older manifest found; tracking all tasks as added.");
    return {
      added: newManifest.tasks,
      removed: [],
      updated: [],
      unchanged: [],
    };
  }

  const result: ManifestDiff = {
    added: [],
    removed: [],
    updated: [],
    unchanged: [],
  };

  const oldTasksById = new Map(oldManifest.tasks.map((t) => [t.id, t]));
  const newTasksById = new Map(newManifest.tasks.map((t) => [t.id, t]));

  // Check for Added, Updated, and Unchanged
  for (const newTask of newManifest.tasks) {
    const oldTask = oldTasksById.get(newTask.id);

    if (!oldTask) {
      result.added.push(newTask);
      continue;
    }

    const changes = compareTasks(oldTask, newTask);
    if (changes.length > 0) {
      result.updated.push({ oldTask, newTask, changes });
    } else {
      result.unchanged.push(newTask);
    }
  }

  // Check for Removed
  for (const oldTask of oldManifest.tasks) {
    if (!newTasksById.has(oldTask.id)) {
      result.removed.push(oldTask);
    }
  }

  log.info(
    {
      added: result.added.length,
      removed: result.removed.length,
      updated: result.updated.length,
      unchanged: result.unchanged.length,
    },
    "manifest diff completed"
  );

  return result;
}

/**
 * Deeply compares two tasks to see what materially changed that would require re-installation.
 * Returns an array of change descriptions, or empty if identical.
 */
function compareTasks(oldTask: InstallTask, newTask: InstallTask): string[] {
  const changes: string[] = [];

  // Check file entries (the actual downloads/versions)
  const oldFiles = oldTask.fileEntries;
  const newFiles = newTask.fileEntries;

  if (oldFiles.length !== newFiles.length) {
    changes.push(`File count changed from ${oldFiles.length} to ${newFiles.length}`);
  } else {
    for (let i = 0; i < oldFiles.length; i++) {
      const oFile = oldFiles[i];
      const nFile = newFiles[i];

      if (oFile.expectedVersion !== nFile.expectedVersion) {
        changes.push(
          `File entry ${i + 1} ('${nFile.labelText}') version changed from '${oFile.expectedVersion || "unknown"}' to '${nFile.expectedVersion || "unknown"}'`
        );
      }
      if (oFile.nexusFileId !== nFile.nexusFileId) {
        changes.push(
          `File entry ${i + 1} ('${nFile.labelText}') Nexus file ID changed from ${oFile.nexusFileId || "none"} to ${nFile.nexusFileId || "none"}`
        );
      }
    }
  }

  // Check FOMOD settings
  if (oldTask.fomod?.length !== newTask.fomod?.length) {
    changes.push("FOMOD instructions changed");
  } else if (oldTask.fomod && newTask.fomod) {
    for (let i = 0; i < oldTask.fomod.length; i++) {
      const oInst = oldTask.fomod[i].selections.join(", ");
      const nInst = newTask.fomod[i].selections.join(", ");
      if (oInst !== nInst) {
        changes.push(`FOMOD step ${i + 1} changed from [${oInst}] to [${nInst}]`);
      }
    }
  }

  return changes;
}
