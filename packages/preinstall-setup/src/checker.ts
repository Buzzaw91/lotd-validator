import { access } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { CheckResult, PathConfig } from "./types.js";

// ── Utility ───────────────────────────────────────────────────────

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ── System prerequisite checks (Windows registry) ─────────────────

function queryRegistry(regPath: string, valueName: string): string | null {
  try {
    const cmd = `powershell -NoProfile -Command "Get-ItemProperty '${regPath}' -Name ${valueName} -ErrorAction Stop | Select-Object -ExpandProperty ${valueName}"`;
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
    return { name: ".NET Framework 4.8+", status: "missing", detail: "Not found in registry", category: "system" };
  }

  const releaseNum = parseInt(release, 10);
  if (releaseNum >= 528040) {
    const ver = releaseNum >= 533320 ? "4.8.1" : "4.8";
    return { name: ".NET Framework 4.8+", status: "ok", detail: `v${ver} (release ${releaseNum})`, category: "system" };
  }

  return { name: ".NET Framework 4.8+", status: "warn", detail: `Release ${releaseNum} — may be too old`, category: "system" };
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
    const majorX86 = queryRegistry(
      "HKLM:\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x86",
      "Major",
    );
    if (majorX86) {
      return { name: "VC++ Redist 2015-2022 (x64)", status: "warn", detail: "Only x86 version found — x64 recommended", category: "system" };
    }
    return { name: "VC++ Redist 2015-2022 (x64)", status: "missing", detail: "Not found in registry", category: "system" };
  }

  return { name: "VC++ Redist 2015-2022 (x64)", status: "ok", detail: `v${major}.${minor}.${bld}`, category: "system" };
}

export function checkSystemPrereqs(): CheckResult[] {
  return [checkDotNet(), checkVcRedist()];
}

// ── Tool directory checks ──────────────────────────────────────────

interface ToolDef {
  name: string;
  folder: string;
  executables: string[];
}

const TOOLS: ToolDef[] = [
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
  { name: "MO2 Conflict Manager", folder: "MO2 Conflict Manager*", executables: ["MO2ConflictManager.exe", "MO2 Conflict Manager.exe"] },
];

async function findGlobFolder(baseDir: string, pattern: string): Promise<string | null> {
  if (!pattern.includes("*")) return join(baseDir, pattern);

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

export async function checkTools(toolsDir: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const tool of TOOLS) {
    const toolPath = await findGlobFolder(toolsDir, tool.folder);

    if (!toolPath || !(await fileExists(toolPath))) {
      results.push({ name: tool.name, status: "missing", detail: `Folder not found: ${tool.folder}`, category: "standalone-tool" });
      continue;
    }

    let foundExe = false;
    for (const exe of tool.executables) {
      const exePath = join(toolPath, exe);
      if (await fileExists(exePath)) {
        results.push({ name: tool.name, status: "ok", detail: exePath, category: "standalone-tool" });
        foundExe = true;
        break;
      }
    }

    if (!foundExe) {
      results.push({
        name: tool.name,
        status: "warn",
        detail: `Folder exists but executable not found: ${tool.executables.join(" / ")}`,
        category: "standalone-tool",
      });
    }
  }

  return results;
}

// ── xEdit Scripts check ─────────────────────────────────────────

const XEDIT_SCRIPTS = [
  { name: "mxpf (Mator's xEdit Patching Framework)", files: ["mxpf.pas"] },
  { name: "TES5EditScripts", files: ["_de_lists.pas", "Apply Script To Selection.pas"] },
  { name: "WICO cleanup script", files: ["Hishy_NPC_RecordForwarding.pas"] },
  { name: "Dark Face Issue Reporter", files: ["DarkFaceIssueReporter.pas"] },
  { name: "Dark Face Issue Reporter Ignore", files: ["darkfaceissuereporter.ini"] },
];

export async function checkXEditScripts(xEditDir: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const editScriptsDir = join(xEditDir, "Edit Scripts");

  if (!(await fileExists(editScriptsDir))) {
    results.push({ name: "xEdit Edit Scripts folder", status: "missing", detail: editScriptsDir, category: "xedit-script" });
    return results;
  }

  for (const script of XEDIT_SCRIPTS) {
    const found = await fileExists(join(editScriptsDir, script.files[0]));
    results.push({
      name: script.name,
      status: found ? "ok" : "missing",
      detail: found ? `Found: ${script.files[0]}` : `Not found: ${script.files[0]}`,
      category: "xedit-script",
    });
  }

  return results;
}

// ── MO2 Plugins check ─────────────────────────────────────────────

const MO2_PLUGINS = [
  { name: "Autoscroller", patterns: ["autoscroller"] },
  { name: "Merge Plugins Hide", patterns: ["deorder_plugins", "merge plugins hide"] },
  { name: "MO2 File Removal Tool", patterns: ["file removal tool", "fileremoval"] },
  { name: "Prepare Merge", patterns: ["prepare merge", "preparemerge"] },
  { name: "Remember Installation Choices", patterns: ["remember installation", "rememberinstallation"] },
  { name: "Set CPU Affinity", patterns: ["cpu affinity", "cpuaffinity", "setcpuaffinity"] },
];

export async function checkMO2Plugins(mo2Path: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const pluginsDir = join(mo2Path, "plugins");

  if (!(await fileExists(pluginsDir))) {
    results.push({ name: "MO2 Plugins Dir", status: "warn", detail: `${pluginsDir} not found`, category: "mo2-plugin" });
    return results;
  }

  let pluginFiles: string[] = [];
  try {
    pluginFiles = await readdir(pluginsDir);
  } catch {}

  const pluginNamesLower = pluginFiles.map((f) => f.toLowerCase());

  for (const plugin of MO2_PLUGINS) {
    const found = plugin.patterns.some((p) =>
      pluginNamesLower.some((f) => f.includes(p.toLowerCase())),
    );
    results.push({
      name: `MO2: ${plugin.name}`,
      status: found ? "ok" : "missing",
      detail: found ? "Found" : "Not found in plugins/",
      category: "mo2-plugin",
    });
  }

  return results;
}

// ── Skyrim folder checks ──────────────────────────────────────────

export async function checkSkyrimFolder(skyrimPath: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const checks: { name: string; file: string; required: boolean }[] = [
    { name: "Skyrim SE", file: "SkyrimSE.exe", required: true },
    { name: "SKSE64", file: "skse64_loader.exe", required: true },
    { name: "ENB Binaries", file: "d3d11.dll", required: true },
    { name: "Creation Kit", file: "CreationKit.exe", required: false },
  ];

  for (const check of checks) {
    const exists = await fileExists(join(skyrimPath, check.file));
    results.push({
      name: check.name,
      status: exists ? "ok" : check.required ? "missing" : "warn",
      detail: exists ? `Found: ${check.file}` : `${check.file} not found`,
      category: "skyrim-folder",
    });
  }

  return results;
}

// ── Tool profiles check ───────────────────────────────────────────

export async function checkToolProfiles(toolsDir: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Synthesis profile
  const synthDir = join(toolsDir, "Synthesis");
  if (await fileExists(synthDir)) {
    // Look for Lexy's profile - typically a .json or folder
    let profileFiles: string[] = [];
    try {
      profileFiles = await readdir(synthDir);
    } catch {}
    const hasLexyProfile = profileFiles.some((f) => f.toLowerCase().includes("lexy"));
    results.push({
      name: "Synthesis: Lexy's Profile",
      status: hasLexyProfile ? "ok" : "missing",
      detail: hasLexyProfile ? "Found" : "No Lexy profile found",
      category: "tool-profile",
    });
  }

  // CAO profiles
  const caoDir = join(toolsDir, "Cathedral Assets Optimizer");
  if (await fileExists(caoDir)) {
    let caoFiles: string[] = [];
    try {
      caoFiles = await readdir(join(caoDir, "profiles")).catch(() => [] as string[]);
    } catch {}
    const hasLexyProfile = caoFiles.some((f) => f.toLowerCase().includes("lexy"));
    results.push({
      name: "CAO: Lexy's Profiles",
      status: hasLexyProfile ? "ok" : "missing",
      detail: hasLexyProfile ? "Found" : "No Lexy profiles found",
      category: "tool-profile",
    });
  }

  return results;
}
