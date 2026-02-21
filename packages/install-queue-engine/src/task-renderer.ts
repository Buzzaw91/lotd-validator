import type { QueueTask } from "@lexy/core-types";

/**
 * Render a QueueTask into a formatted string for CLI display.
 */
export function renderTask(task: QueueTask, index?: number): string {
  const lines: string[] = [];

  // Header
  const prefix = index !== undefined ? `[${index + 1}]` : `[${task.taskId}]`;
  lines.push(`${prefix} ${task.modTitle}`);
  lines.push(`    Page: ${task.pageSlug} | Section: ${task.sectionTitle}`);
  lines.push(`    Install Mode: ${task.installModeHint}`);

  // Tags
  if (task.tags.length > 0) {
    lines.push(`    Tags: ${task.tags.join(", ")}`);
  }

  // File entries
  for (let i = 0; i < task.fileEntries.length; i++) {
    const fe = task.fileEntries[i]!;
    const validation = task.validations.find((v) => v.fileEntryIndex === i);
    const statusIcon = validation
      ? statusToIcon(validation.status)
      : "❓";

    lines.push(`    ${statusIcon} [${fe.fileCategory}] ${fe.labelText}`);
    if (fe.expectedVersion) {
      lines.push(`       Version: ${fe.expectedVersion}`);
    }
    if (validation?.matchedFileName) {
      lines.push(`       Matched: ${validation.matchedFileName} v${validation.matchedVersion ?? "?"}`);
    }
    if (validation?.notes && validation.notes.length > 0) {
      for (const note of validation.notes) {
        lines.push(`       📝 ${note}`);
      }
    }
  }

  // FOMOD
  if (task.fomod && task.fomod.length > 0) {
    lines.push("    📋 FOMOD Instructions:");
    for (const step of task.fomod) {
      if (step.stepLabel) lines.push(`       Step: ${step.stepLabel}`);
      for (const sel of step.selections) {
        lines.push(`       ✓ ${sel}`);
      }
    }
  }

  // Special instructions
  if (task.specialInstructions && task.specialInstructions.length > 0) {
    lines.push("    ⚙️ Special Instructions:");
    for (const instr of task.specialInstructions) {
      lines.push(`       ${instr}`);
    }
  }

  // Warnings
  if (task.warnings.length > 0) {
    lines.push("    Warnings:");
    for (const w of task.warnings) {
      lines.push(`       ${w}`);
    }
  }

  return lines.join("\n");
}

function statusToIcon(status: string): string {
  switch (status) {
    case "MATCH":
      return "✅";
    case "PARTIAL":
      return "⚡";
    case "MISMATCH":
      return "❌";
    case "ARCHIVED_REQUIRED":
      return "📦";
    case "MANUAL":
      return "🔧";
    default:
      return "❓";
  }
}
