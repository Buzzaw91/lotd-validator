import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";

const ConfigSchema = z.object({
  nexusApiKey: z.string().min(1),
  guideBaseUrl: z.string().url().default("https://lexyslotd.com/guide/"),
  dataDir: z.string(),
  mo2: z
    .object({
      portableRoot: z.string().optional(),
      downloadsDir: z.string().optional(),
      modsDir: z.string().optional(),
      profilesDir: z.string().optional(),
    })
    .optional(),
});

export type LexyConfig = z.infer<typeof ConfigSchema>;

const CONFIG_DIR = join(homedir(), ".lexy-assistant");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

/**
 * Load and validate config from ~/.lexy-assistant/config.json
 */
export async function loadConfig(): Promise<LexyConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return ConfigSchema.parse(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Config file not found at ${CONFIG_PATH}.\nRun "lexy config init" to create one.`,
      );
    }
    throw err;
  }
}

/**
 * Create a default config file.
 */
export async function initConfig(nexusApiKey: string, dataDir?: string): Promise<string> {
  await mkdir(CONFIG_DIR, { recursive: true });

  const config: LexyConfig = {
    nexusApiKey,
    guideBaseUrl: "https://lexyslotd.com/guide/",
    dataDir: dataDir ?? join(CONFIG_DIR, "data"),
  };

  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  return CONFIG_PATH;
}

/**
 * Check config paths and report issues.
 */
export async function doctorConfig(config: LexyConfig): Promise<string[]> {
  const issues: string[] = [];

  // Check dataDir
  try {
    await access(config.dataDir);
  } catch {
    issues.push(`Data directory does not exist: ${config.dataDir}`);
  }

  // Check API key format (basic)
  if (config.nexusApiKey.length < 10) {
    issues.push("Nexus API key looks too short");
  }

  // Check MO2 paths if configured
  if (config.mo2) {
    const mo2Entries = config.mo2 as Record<string, string | undefined>;
    for (const [key, path] of Object.entries(mo2Entries)) {
      if (path) {
        try {
          await access(path);
        } catch {
          issues.push(`MO2 path not found — ${key}: ${path}`);
        }
      }
    }
  }

  return issues;
}

export { CONFIG_PATH, CONFIG_DIR };
