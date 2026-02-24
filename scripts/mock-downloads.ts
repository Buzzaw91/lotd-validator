import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DOWNLOADS_DIR = "C:\\Programs\\MO2\\downloads";
const SEVEN_ZIP = "C:\\Program Files\\7-Zip\\7z.exe";

interface MockSpec {
  name: string;
  files: string[];
}

const MOCKS: MockSpec[] = [
  { name: "mxpf", files: ["Edit Scripts/mxpf.pas"] },
  { name: "TES5EditScripts", files: ["Edit Scripts/_de_lists.pas", "Edit Scripts/Apply Script To Selection.pas"] },
  { name: "WICO cleanup script", files: ["Hishy_NPC_RecordForwarding.pas"] },
  { name: "Dark Face Issue Reporter", files: ["DarkFaceIssueReporter.pas"] },
  { name: "Dark Face Issue Reporter Ignore", files: ["darkfaceissuereporter.ini"] },
  { name: "Autoscroller", files: ["autoscroller.py"] },
  { name: "Merge Plugins Hide", files: ["deorder_plugins/dummy.txt"] },
  { name: "MO2 File Removal Tool", files: ["file removal tool/dummy.txt"] },
  { name: "Prepare Merge", files: ["prepare merge/dummy.txt"] },
  { name: "Remember Installation Choices", files: ["remember installation/dummy.txt"] },
  { name: "Set CPU Affinity", files: ["cpu affinity/dummy.txt"] },
  { name: "SKSE64", files: ["skse64_loader.exe", "skse64_1_6_1170.dll"] },
  { name: "ENB Series Binaries", files: ["WrapperVersion/d3d11.dll", "WrapperVersion/d3dcompiler_46e.dll"] },
  { name: "Ljoss ReLUX", files: ["2.1/enbseries/dummy.txt"] },
  { name: "Ljoss ELFX Changes", files: ["weather_elfx.esp"] },
  { name: "Creation Kit Platform Extended", files: ["winhttp.dll"] },
  { name: "Lexy's LOTD Synthesis Profile", files: ["Lexy/profile.json"] },
  { name: "Lexy's LOTD CAO Profiles", files: ["profiles/lexy.json"] }
];

async function generateMocks() {
  await mkdir(DOWNLOADS_DIR, { recursive: true });

  for (const mock of MOCKS) {
    const tempDir = join(DOWNLOADS_DIR, `temp_${mock.name.replace(/[^a-zA-Z0-9]/g, '')}`);
    const archivePath = join(DOWNLOADS_DIR, `${mock.name} - Mock.7z`);

    try {
      await rm(tempDir, { recursive: true, force: true });
      await rm(archivePath, { force: true });
      await mkdir(tempDir, { recursive: true });

      for (const file of mock.files) {
        const filePath = join(tempDir, file);
        await mkdir(join(filePath, ".."), { recursive: true });
        await writeFile(filePath, `Mock file for ${file}`);
      }

      await execFileAsync(SEVEN_ZIP, ["a", archivePath, join(tempDir, "*")]);
      console.log(`✅ Generated mock archive: ${archivePath}`);
    } catch (err: any) {
      console.error(`❌ Failed to generate ${mock.name}:`, err.message);
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

generateMocks().catch(console.error);
