import { access } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

interface CheckResult {
  name: string;
  status: "ok" | "missing" | "warn";
  detail: string;
}

// ── System prerequisite checks (Windows registry) ─────────────────

function queryRegistry(path: string, valueName: string): string | null {
  try {
    const cmd = `powershell -NoProfile -Command "Get-ItemProperty '${path}' -Name ${valueName} -ErrorAction Stop | Select-Object -ExpandProperty ${valueName}"`;
    return execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

function checkDotNet(): CheckResult {
  const release = queryRegistry(
    "HKLM:\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full",
    "Release",
  );

  if (!release) {
    return { name: ".NET Framework 4.8+", status: "missing", detail: "Not found in registry" };
  }

  const releaseNum = parseInt(release, 10);
  // 528040 = .NET 4.8, 533320 = .NET 4.8.1
  if (releaseNum >= 528040) {
    const ver = releaseNum >= 533320 ? "4.8.1" : "4.8";
    return { name: ".NET Framework 4.8+", status: "ok", detail: `v${ver} (release ${releaseNum})` };
  }

  return { name: ".NET Framework 4.8+", status: "warn", detail: `Release ${releaseNum} — may be too old` };
}

function checkVcRedist(): CheckResult {
  const major = queryRegistry(
    "HKLM:\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64",
    "Major",
  );
  const minor = queryRegistry(
    "HKLM:\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64",
    "Minor",
  );
  const bld = queryRegistry(
    "HKLM:\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64",
    "Bld",
  );

  if (!major) {
    // Also check x86
    const majorX86 = queryRegistry(
      "HKLM:\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x86",
      "Major",
    );
    if (majorX86) {
      return { name: "VC++ Redist 2015-2022 (x64)", status: "warn", detail: "Only x86 version found — x64 recommended" };
    }
    return { name: "VC++ Redist 2015-2022 (x64)", status: "missing", detail: "Not found in registry" };
  }

  return {
    name: "VC++ Redist 2015-2022 (x64)",
    status: "ok",
    detail: `v${major}.${minor}.${bld}`,
  };
}

// ── Tool directory checks ──────────────────────────────────────────

interface ToolDefinition {
  name: string;
  folder: string;
  /** File(s) to check — first match wins */
  executables: string[];
}

const TOOLS: ToolDefinition[] = [
  { name: "LOOT", folder: "LOOT", executables: ["LOOT.exe"] },
  { name: "xEdit", folder: "xEdit", executables: ["SSEEdit.exe", "xEdit.exe"] },
  { name: "DynDOLOD", folder: "DynDOLOD Special Edition", executables: ["DynDOLODx64.exe"] },
  { name: "xLODGen", folder: "xLODGen", executables: ["xLODGenx64.exe", "xLODGen.exe"] },
  { name: "Synthesis", folder: "Synthesis", executables: ["Synthesis.exe"] },
  { name: "BethINI Pie", folder: "Bethini Pie", executables: ["Bethini.exe"] },
  { name: "Cathedral Assets Optimizer", folder: "Cathedral Assets Optimizer", executables: ["Cathedral_Assets_Optimizer.exe"] },
  { name: "Wrye Bash", folder: "Wrye Bash", executables: ["Wrye Bash.exe"] },
  { name: "zEdit", folder: "zEdit*", executables: ["zEdit.exe"] },
  { name: "ACMOS Road Generator", folder: "ACMOS Road Generator", executables: ["ACMOS Road Generator.exe"] },
  { name: "Nemesis", folder: "Nemesis Unlimited Behavior Engine", executables: ["Nemesis_Engine/Nemesis Unlimited Behavior Engine.exe"] },
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findGlobFolder(baseDir: string, pattern: string): Promise<string | null> {
  // Simple glob: if pattern ends with *, scan for matching dirs
  if (!pattern.includes("*")) return join(baseDir, pattern);

  const { readdir } = await import("node:fs/promises");
  const prefix = pattern.replace("*", "");
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(prefix)) {
        return join(baseDir, entry.name);
      }
    }
  } catch {}
  return null;
}

async function checkTools(toolsDir: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const tool of TOOLS) {
    const toolPath = await findGlobFolder(toolsDir, tool.folder);

    if (!toolPath || !(await fileExists(toolPath))) {
      results.push({ name: tool.name, status: "missing", detail: `Folder not found: ${tool.folder}` });
      continue;
    }

    let foundExe = false;
    for (const exe of tool.executables) {
      const exePath = join(toolPath, exe);
      if (await fileExists(exePath)) {
        results.push({ name: tool.name, status: "ok", detail: exePath });
        foundExe = true;
        break;
      }
    }

    if (!foundExe) {
      results.push({
        name: tool.name,
        status: "warn",
        detail: `Folder exists but executable not found: ${tool.executables.join(" / ")}`,
      });
    }
  }

  return results;
}

// ── Skyrim folder checks (SKSE, ENB) ──────────────────────────────

async function checkSkyrimFolder(skyrimPath: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Check Skyrim itself
  const skyrimExe = join(skyrimPath, "SkyrimSE.exe");
  if (await fileExists(skyrimExe)) {
    results.push({ name: "Skyrim SE", status: "ok", detail: skyrimExe });
  } else {
    results.push({ name: "Skyrim SE", status: "missing", detail: `SkyrimSE.exe not found in ${skyrimPath}` });
  }

  // Check SKSE
  const skseDll = join(skyrimPath, "skse64_loader.exe");
  if (await fileExists(skseDll)) {
    results.push({ name: "SKSE64", status: "ok", detail: skseDll });
  } else {
    results.push({ name: "SKSE64", status: "missing", detail: "skse64_loader.exe not found" });
  }

  // Check ENB binaries
  const enbDll = join(skyrimPath, "d3d11.dll");
  const enbLocal = join(skyrimPath, "enblocal.ini");
  if (await fileExists(enbDll)) {
    results.push({ name: "ENB Binaries", status: "ok", detail: "d3d11.dll found" });
  } else {
    results.push({ name: "ENB Binaries", status: "missing", detail: "d3d11.dll not found — ENB not installed" });
  }

  // Check Creation Kit
  const ckExe = join(skyrimPath, "CreationKit.exe");
  if (await fileExists(ckExe)) {
    results.push({ name: "Creation Kit", status: "ok", detail: ckExe });
  } else {
    results.push({ name: "Creation Kit", status: "warn", detail: "CreationKit.exe not found (optional)" });
  }

  return results;
}

// ── MO2 plugins check ─────────────────────────────────────────────

const EXPECTED_MO2_PLUGINS = [
  "autoscroller",
  "Merge Plugins Hide",
  "File Removal Tool",
  "Prepare Merge",
  "Remember Installation Choices",
  "Set CPU Affinity",
];

async function checkMO2Plugins(mo2Path: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const pluginsDir = join(mo2Path, "plugins");

  if (!(await fileExists(pluginsDir))) {
    results.push({ name: "MO2 Plugins Dir", status: "warn", detail: `${pluginsDir} not found` });
    return results;
  }

  const { readdir } = await import("node:fs/promises");
  let pluginFiles: string[] = [];
  try {
    pluginFiles = await readdir(pluginsDir);
  } catch {}

  const pluginNamesLower = pluginFiles.map((f) => f.toLowerCase());

  for (const expected of EXPECTED_MO2_PLUGINS) {
    const found = pluginNamesLower.some((f) => f.includes(expected.toLowerCase()));
    if (found) {
      results.push({ name: `MO2 Plugin: ${expected}`, status: "ok", detail: "Found" });
    } else {
      results.push({ name: `MO2 Plugin: ${expected}`, status: "missing", detail: "Not found in plugins/" });
    }
  }

  return results;
}

// ── Public entry point ────────────────────────────────────────────

export interface PreinstallReport {
  system: CheckResult[];
  tools: CheckResult[];
  skyrim: CheckResult[];
  mo2Plugins: CheckResult[];
}

export async function runPreinstallCheck(opts: {
  toolsDir?: string;
  skyrimPath?: string;
  mo2Path?: string;
}): Promise<PreinstallReport> {
  // System checks
  const system = [checkDotNet(), checkVcRedist()];

  // Tool checks
  const toolsDir = opts.toolsDir ?? "C:\\Programs";
  const tools = await checkTools(toolsDir);

  // Skyrim checks
  const skyrim = opts.skyrimPath ? await checkSkyrimFolder(opts.skyrimPath) : [];

  // MO2 plugins
  const mo2Plugins = opts.mo2Path ? await checkMO2Plugins(opts.mo2Path) : [];

  return { system, tools, skyrim, mo2Plugins };
}

export function formatPreinstallReport(report: PreinstallReport, opts?: { toolsDir?: string; skyrimPath?: string; mo2Path?: string }): string {
  const lines: string[] = [];
  const icon = (r: CheckResult) => r.status === "ok" ? "✅" : r.status === "missing" ? "❌" : "⚠️";

  lines.push("\n🔍 Preinstallation Prerequisites Check\n");

  // System
  lines.push("📦 System Prerequisites");
  for (const r of report.system) {
    lines.push(`  ${icon(r)} ${r.name} — ${r.detail}`);
  }

  // Tools
  lines.push(`\n🛠️  Modding Tools (${opts?.toolsDir ?? "C:\\Programs"})`);
  for (const r of report.tools) {
    lines.push(`  ${icon(r)} ${r.name} — ${r.detail}`);
  }

  // Skyrim
  if (report.skyrim.length > 0) {
    lines.push(`\n🎮 Skyrim Folder (${opts?.skyrimPath})`);
    for (const r of report.skyrim) {
      lines.push(`  ${icon(r)} ${r.name} — ${r.detail}`);
    }
  } else if (!opts?.skyrimPath) {
    lines.push("\n🎮 Skyrim Folder");
    lines.push("  ⚠️  Not configured — add \"skyrimPath\" to ~/.lexy-assistant/config.json");
  }

  // MO2 Plugins
  if (report.mo2Plugins.length > 0) {
    lines.push(`\n🔌 MO2 Plugins (${opts?.mo2Path})`);
    for (const r of report.mo2Plugins) {
      lines.push(`  ${icon(r)} ${r.name} — ${r.detail}`);
    }
  } else if (!opts?.mo2Path) {
    lines.push("\n🔌 MO2 Plugins");
    lines.push("  ⚠️  Not configured — add \"mo2.portableRoot\" to config");
  }

  // Summary
  const all = [...report.system, ...report.tools, ...report.skyrim, ...report.mo2Plugins];
  const ok = all.filter((r) => r.status === "ok").length;
  const missing = all.filter((r) => r.status === "missing").length;
  const warn = all.filter((r) => r.status === "warn").length;

  lines.push(`\n📊 Summary: ${ok} passed, ${missing} missing, ${warn} warnings`);

  return lines.join("\n");
}
