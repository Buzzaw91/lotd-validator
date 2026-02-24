import type { CheckResult, PathConfig, PreinstallReport } from "./types.js";
import {
  checkSystemPrereqs,
  checkTools,
  checkXEditScripts,
  checkMO2Plugins,
  checkSkyrimFolder,
  checkToolProfiles,
} from "./checker.js";

export type { CheckResult, PathConfig, PreinstallReport, SetupResult, SetupTask } from "./types.js";
export { find7Zip, extractArchive, findArchiveInDownloads, executeSetupTask } from "./installer.js";
export { SETUP_TASKS } from "./tasks.js";
export {
  checkSystemPrereqs,
  checkTools,
  checkXEditScripts,
  checkMO2Plugins,
  checkSkyrimFolder,
  checkToolProfiles,
} from "./checker.js";

/**
 * Run all preinstallation checks.
 */
export async function runPreinstallCheck(paths: PathConfig): Promise<PreinstallReport> {
  const system = checkSystemPrereqs();

  const tasks: CheckResult[] = [];

  // Tool installations
  tasks.push(...(await checkTools(paths.toolsDir)));

  // xEdit scripts
  const xEditDir = paths.xEditDir ?? `${paths.toolsDir}\\xEdit`;
  tasks.push(...(await checkXEditScripts(xEditDir)));

  // MO2 plugins
  if (paths.mo2Path) {
    tasks.push(...(await checkMO2Plugins(paths.mo2Path)));
  }

  // Skyrim folder
  if (paths.skyrimPath) {
    tasks.push(...(await checkSkyrimFolder(paths.skyrimPath)));
  }

  // Tool profiles
  tasks.push(...(await checkToolProfiles(paths.toolsDir)));

  // Summary
  const all = [...system, ...tasks];
  const summary = {
    ok: all.filter((r) => r.status === "ok").length,
    missing: all.filter((r) => r.status === "missing").length,
    warn: all.filter((r) => r.status === "warn").length,
  };

  return { system, tasks, summary };
}

/**
 * Format a preinstall report for CLI output.
 */
export function formatPreinstallReport(report: PreinstallReport, paths: PathConfig): string {
  const lines: string[] = [];
  const icon = (r: CheckResult) =>
    r.status === "ok" ? "✅" : r.status === "missing" ? "❌" : "⚠️";

  lines.push("\n🔍 Preinstallation Prerequisites Check\n");

  // System
  lines.push("📦 System Prerequisites");
  for (const r of report.system) {
    lines.push(`  ${icon(r)} ${r.name} — ${r.detail}`);
  }

  // Group tasks by category
  const categories: Record<string, { title: string; emoji: string; context?: string }> = {
    "standalone-tool": { title: "Modding Tools", emoji: "🛠️", context: paths.toolsDir },
    "xedit-script": { title: "xEdit Scripts", emoji: "📜", context: paths.xEditDir ?? `${paths.toolsDir}\\xEdit` },
    "mo2-plugin": { title: "MO2 Plugins", emoji: "🔌", context: paths.mo2Path },
    "skyrim-folder": { title: "Skyrim Folder", emoji: "🎮", context: paths.skyrimPath },
    "tool-profile": { title: "Tool Profiles", emoji: "📋", context: paths.toolsDir },
  };

  for (const [cat, meta] of Object.entries(categories)) {
    const catTasks = report.tasks.filter((t) => t.category === cat);
    if (catTasks.length === 0) {
      if (!meta.context) {
        lines.push(`\n${meta.emoji} ${meta.title}`);
        lines.push(`  ⚠️  Not configured`);
      }
      continue;
    }

    lines.push(`\n${meta.emoji} ${meta.title}${meta.context ? ` (${meta.context})` : ""}`);
    for (const r of catTasks) {
      lines.push(`  ${icon(r)} ${r.name} — ${r.detail}`);
    }
  }

  // Show unconfigured paths
  if (!paths.skyrimPath) {
    lines.push("\n🎮 Skyrim Folder");
    lines.push('  ⚠️  Not configured — add "skyrimPath" to ~/.lexy-assistant/config.json');
  }
  if (!paths.mo2Path) {
    lines.push("\n🔌 MO2 Plugins");
    lines.push('  ⚠️  Not configured — add "mo2.portableRoot" to config.json');
  }

  // Summary
  lines.push(
    `\n📊 Summary: ${report.summary.ok} passed, ${report.summary.missing} missing, ${report.summary.warn} warnings`,
  );

  return lines.join("\n");
}
