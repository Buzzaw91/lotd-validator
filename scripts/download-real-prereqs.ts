import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NexusClient } from "../packages/nexus-resolver/src/nexus-client.js";
import { loadConfig } from "../apps/cli/src/config.js";

const GITHUB_DOWNLOADS = [
  { name: "mxpf", url: "https://github.com/matortheeternal/mxpf/archive/refs/heads/master.zip", ext: ".zip" },
  { name: "TES5EditScripts", url: "https://github.com/TES5Edit/TES5EditScripts/archive/refs/heads/master.zip", ext: ".zip" },
  { name: "Merge Plugins Hide", url: "https://github.com/deorder/mo2-plugins/archive/refs/heads/master.zip", ext: ".zip" },
  { name: "SKSE64", url: "https://skse.silverlock.org/beta/skse64_2_2_6.7z", ext: ".7z" }
];

const NEXUS_MOD_IDS = [
  5049,    // WICO cleanup
  42133,   // Dark Face Issue Reporter
  85672,   // DFIR - Ignore
  165507,  // Autoscroller
  117306,  // MO2 File Removal Tool
  47791,   // Prepare Merge
  140678,  // Remember Installation Choices
  94636,   // Set CPU Affinity
  63578,   // Ljoss ReLUX
  71371    // CK Platform Extended
];

async function downloadFile(url: string, dest: string) {
  console.log(`Downloading ${url} -> ${dest}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error("No body");
  
  // Web stream to Node stream pipeline
  const stream = createWriteStream(dest);
  const reader = res.body.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    stream.write(Buffer.from(value));
  }
  stream.end();
}

async function run() {
  const config = await loadConfig();
  const apiKey = config.nexusApiKey;
  const downloadsDir = "C:\\Programs\\MO2\\downloads";
  
  await mkdir(downloadsDir, { recursive: true });

  for (const dl of GITHUB_DOWNLOADS) {
    try {
      await downloadFile(dl.url, join(downloadsDir, `${dl.name}${dl.ext}`));
      console.log(`✅ Downloaded ${dl.name}`);
    } catch (err: any) {
      console.error(`❌ Failed ${dl.name}: ${err.message}`);
    }
  }

  if (!apiKey) {
    console.log("No Nexus API key found. Skipping Nexus downloads.");
    return;
  }

  const client = new NexusClient({ apiKey });

  for (const modId of NEXUS_MOD_IDS) {
    try {
      console.log(`Fetching info for Nexus Mod ${modId}...`);
      const filesResp = await client.getModFiles(modId);
      
      // Try to find the primary file, otherwise pick the first main file
      const primaryFile = filesResp.files.find(f => f.is_primary) 
                          || filesResp.files.find(f => f.category_id === 1) // Main file category
                          || filesResp.files[0];
                          
      if (!primaryFile) {
        console.error(`❌ No files found for mod ${modId}`);
        continue;
      }
      
      const links = await client.getDownloadLinks(modId, primaryFile.file_id);
      if (links.length === 0) {
        console.error(`❌ No download links for file ${primaryFile.file_id}`);
        continue;
      }
      
      const filename = primaryFile.file_name.replace(/[^a-zA-Z0-9.\-_\s]/g, "");
      const dest = join(downloadsDir, filename);
      
      await downloadFile(links[0].URI, dest);
      console.log(`✅ Downloaded ${filename}`);
    } catch (err: any) {
      console.error(`❌ Failed Nexus mod ${modId}: ${err.message}`);
    }
  }
}

run().catch(console.error);
