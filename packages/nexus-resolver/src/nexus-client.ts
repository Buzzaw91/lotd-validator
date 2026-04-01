import { request } from "undici";
import Bottleneck from "bottleneck";
import pRetry, { AbortError } from "p-retry";
import { createLogger } from "@lexy/logger";

const log = createLogger("nexus-client");

const NEXUS_API_BASE = "https://api.nexusmods.com/v1";
const GAME_DOMAIN = "skyrimspecialedition";

// Rate limiter: Nexus Free API = ~30 req/s daily limit is ~2500/day
// Be conservative: 1 req per second
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1000,
});

export interface NexusClientOptions {
  apiKey: string;
}

export interface NexusModInfo {
  mod_id: number;
  name: string;
  summary: string;
  version: string;
  author: string;
  status: string;
  available: boolean;
}

export interface NexusFileInfo {
  id: [number, number]; // [file_id, ?]
  file_id: number;
  name: string;
  file_name: string;
  version: string;
  category_id: number;
  category_name: string;
  size_in_bytes: number;
  is_primary: boolean;
  description: string;
}

export interface NexusFilesResponse {
  files: NexusFileInfo[];
  file_updates: unknown[];
}

export interface NexusDownloadLink {
  name: string;
  short_name: string;
  URI: string;
}

export class NexusClient {
  private apiKey: string;

  constructor(options: NexusClientOptions) {
    this.apiKey = options.apiKey;
  }

  /** Get mod metadata */
  async getModInfo(modId: number, gameDomain = GAME_DOMAIN): Promise<NexusModInfo> {
    return this.apiRequest<NexusModInfo>(
      `${NEXUS_API_BASE}/games/${gameDomain}/mods/${modId}.json`,
    );
  }

  /** Get all files for a mod */
  async getModFiles(modId: number, gameDomain = GAME_DOMAIN): Promise<NexusFilesResponse> {
    return this.apiRequest<NexusFilesResponse>(
      `${NEXUS_API_BASE}/games/${gameDomain}/mods/${modId}/files.json`,
    );
  }

  /**
   * Get download links for a specific file (premium only).
   * Returns an array of CDN mirror URLs.
   */
  async getDownloadLinks(modId: number, fileId: number, gameDomain = GAME_DOMAIN): Promise<NexusDownloadLink[]> {
    return this.apiRequest<NexusDownloadLink[]>(
      `${NEXUS_API_BASE}/games/${gameDomain}/mods/${modId}/files/${fileId}/download_link.json`,
    );
  }

  /** Rate-limited + retried API request */
  private async apiRequest<T>(url: string): Promise<T> {
    return limiter.schedule(() =>
      pRetry(
        async () => {
          log.debug({ url }, "API request");
          const res = await request(url, {
            headers: {
              apikey: this.apiKey,
              "User-Agent": "LexyAssistant/0.1",
              Accept: "application/json",
            },
          });

          if (res.statusCode === 429) {
            throw new Error("Rate limited by Nexus API");
          }

          if (res.statusCode !== 200) {
            throw new AbortError(
              `Nexus API returned ${res.statusCode} for ${url}`,
            );
          }

          return (await res.body.json()) as T;
        },
        {
          retries: 3,
          minTimeout: 2000,
          onFailedAttempt: (err) => {
            log.warn(
              { attempt: err.attemptNumber, url },
              "API request failed, retrying",
            );
          },
        },
      ),
    );
  }
}
