import { join } from "node:path";
import type { SetupTask, PathConfig } from "./types.js";

function getXEditScriptsDir(p: PathConfig): string {
  return join(p.xEditDir ?? join(p.toolsDir, "xEdit"), "Edit Scripts");
}

function getMo2PluginsDir(p: PathConfig): string {
  if (!p.mo2Path) throw new Error("MO2 path must be configured for this task");
  return join(p.mo2Path, "plugins");
}

function getSkyrimDir(p: PathConfig): string {
  if (!p.skyrimPath) throw new Error("Skyrim path must be configured for this task");
  return p.skyrimPath;
}

export const SETUP_TASKS: SetupTask[] = [
  // ── xEdit Scripts ───────────────────────────────────────────────
  {
    id: "xedit-mxpf",
    name: "mxpf (Mator's xEdit Patching Framework)",
    category: "xedit-script",
    description: "Extract Edit Scripts/* to xEdit/Edit Scripts",
    getTargetDir: getXEditScriptsDir,
    flattenTopLevel: true,
    archiveMatch: ["mxpf", "patching framework"],
    sourcePattern: ["Edit Scripts/*"],
    checkFiles: ["mxpf.pas"],
  },
  {
    id: "xedit-tes5editscripts",
    name: "TES5EditScripts",
    category: "xedit-script",
    description: "Extract Edit Scripts/* to xEdit/Edit Scripts",
    getTargetDir: getXEditScriptsDir,
    flattenTopLevel: true,
    sourcePattern: ["Edit Scripts/*"],
    checkFiles: ["_de_lists.pas", "Apply Script To Selection.pas"],
  },
  {
    id: "xedit-wico-cleanup",
    name: "WICO cleanup script",
    category: "xedit-script",
    nexusModId: 5049,
    description: "Extract .pas to xEdit/Edit Scripts",
    getTargetDir: getXEditScriptsDir,
    archiveMatch: ["striped bsa", "wico cleanup"],
    sourcePattern: ["**/*.pas"],
    checkFiles: ["Hishy_NPC_RecordForwarding.pas"],
  },
  {
    id: "xedit-darkface-reporter",
    name: "Dark Face Issue Reporter",
    category: "xedit-script",
    nexusModId: 42133,
    description: "Extract scripts to xEdit/Edit Scripts",
    getTargetDir: getXEditScriptsDir,
    archiveMatch: ["darkfaceissuereporter"],
    sourcePattern: ["*"],
    checkFiles: ["DarkFaceIssueReporter.pas"],
  },
  {
    id: "xedit-darkface-ignore",
    name: "Dark Face Issue Reporter Ignore",
    category: "xedit-script",
    nexusModId: 85672,
    description: "Extract .ini to xEdit/Edit Scripts",
    getTargetDir: getXEditScriptsDir,
    archiveMatch: ["dark face issue reporter ignore"],
    sourcePattern: ["*.ini"],
    checkFiles: ["darkfaceissuereporter.ini"],
  },

  // ── MO2 Plugins ─────────────────────────────────────────────────
  {
    id: "mo2-autoscroller",
    name: "Autoscroller",
    category: "mo2-plugin",
    nexusModId: 165507,
    description: "Extract to MO2/plugins",
    getTargetDir: getMo2PluginsDir,
    sourcePattern: ["*"],
    checkFiles: ["autoscroller\\.py", "autoscroller"], // Will match regex or partial
  },
  {
    id: "mo2-merge-plugins-hide",
    name: "Merge Plugins Hide",
    category: "mo2-plugin",
    description: "Extract to MO2/plugins and rename folder to deorder_plugins",
    getTargetDir: getMo2PluginsDir,
    flattenTopLevel: true,
    sourcePattern: ["*"],
    checkFiles: ["deorder_plugins", "merge plugins hide"],
  },
  {
    id: "mo2-file-removal-tool",
    name: "MO2 File Removal Tool",
    category: "mo2-plugin",
    nexusModId: 117306,
    description: "Extract to MO2/plugins",
    getTargetDir: getMo2PluginsDir,
    sourcePattern: ["*"],
    checkFiles: ["file removal tool", "fileremoval"],
  },
  {
    id: "mo2-prepare-merge",
    name: "Prepare Merge",
    category: "mo2-plugin",
    nexusModId: 47791,
    description: "Extract to MO2/plugins",
    getTargetDir: getMo2PluginsDir,
    sourcePattern: ["*"],
    checkFiles: ["prepare merge", "preparemerge"],
  },
  {
    id: "mo2-remember-installation",
    name: "Remember Installation Choices",
    category: "mo2-plugin",
    nexusModId: 140678,
    description: "Extract to MO2/plugins",
    getTargetDir: getMo2PluginsDir,
    sourcePattern: ["*"],
    checkFiles: ["remember installation", "rememberinstallation"],
  },
  {
    id: "mo2-cpu-affinity",
    name: "Set CPU Affinity",
    category: "mo2-plugin",
    nexusModId: 94636,
    description: "Extract to MO2/plugins",
    getTargetDir: getMo2PluginsDir,
    sourcePattern: ["*"],
    checkFiles: ["cpu affinity", "cpuaffinity"],
  },

  // ── Skyrim Folder ───────────────────────────────────────────────
  {
    id: "skyrim-skse64",
    name: "SKSE64",
    category: "skyrim-folder",
    nexusModId: 30379,
    description: "Copy dll/loader to Skyrim root",
    getTargetDir: getSkyrimDir,
    flattenTopLevel: true,
    archiveMatch: ["skse64"],
    sourcePattern: ["*.dll", "*.exe"], // Specifically skse64_1_6_1170.dll and skse64_loader.exe
    checkFiles: ["skse64_loader.exe"],
  },
  {
    id: "skyrim-enb-binaries",
    name: "ENB Series Binaries",
    category: "skyrim-folder",
    description: "Copy ENB binaries to Skyrim root",
    getTargetDir: getSkyrimDir,
    sourcePattern: ["WrapperVersion/d3d11.dll", "WrapperVersion/d3dcompiler_46e.dll"],
    checkFiles: ["d3d11.dll"],
  },
  {
    id: "skyrim-ljoss-relux",
    name: "Ljoss ReLUX",
    category: "skyrim-folder",
    nexusModId: 63578,
    description: "Extract to Skyrim root",
    getTargetDir: getSkyrimDir,
    sourcePattern: ["*"],
    checkFiles: ["enbseries"], // Has enbseries folder usually
  },
  {
    id: "skyrim-ljoss-elfx",
    name: "Ljoss ELFX Changes",
    category: "skyrim-folder",
    description: "Extract to Skyrim root",
    getTargetDir: getSkyrimDir,
    sourcePattern: ["*"],
    checkFiles: ["weather_elfx.esp"], // Specific check might vary, assuming generic extract
  },
  {
    id: "skyrim-ck-platform-extended",
    name: "Creation Kit Platform Extended",
    category: "skyrim-folder",
    nexusModId: 71371,
    description: "Extract to Skyrim root",
    getTargetDir: getSkyrimDir,
    sourcePattern: ["*"],
    checkFiles: ["winhttp.dll"], // Expected dll for CK
  },

  // ── Tool Profiles ───────────────────────────────────────────────
  {
    id: "tool-synthesis-profile",
    name: "Lexy's LOTD Synthesis Profile",
    category: "tool-profile",
    description: "Extract to Synthesis folder",
    getTargetDir: (p) => join(p.toolsDir, "Synthesis"),
    sourcePattern: ["*"],
    checkFiles: ["lexy"], // Partial match for the profile dir/files
  },
  {
    id: "tool-cao-profiles",
    name: "Lexy's LOTD CAO Profiles",
    category: "tool-profile",
    description: "Extract to Cathedral Assets Optimizer profiles folder",
    getTargetDir: (p) => join(p.toolsDir, "Cathedral Assets Optimizer"),
    sourcePattern: ["*"],
    checkFiles: ["profiles"], // Profiles subfolder
  }
];
