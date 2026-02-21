# Lexy LOTD Validator

A CLI companion tool for following [Lexy's Legacy of the Dragonborn](https://lexyslotd.com/) Skyrim SE modding guide. It parses the guide, validates mod files against the Nexus Mods API, and provides a step-by-step install queue to track your progress.

## What It Does

1. **Parses** the Lexy guide HTML into a structured manifest of 1,300+ mod tasks
2. **Validates** each mod's files against the Nexus Mods API (correct version, file availability)
3. **Queues** tasks in install order with file categories, FOMOD instructions, and special steps
4. **Tracks** your progress with a local SQLite session (mark-done, mark-blocked)
5. **Reports** on validation confidence, mismatches, and archived files

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** (`npm install -g pnpm`)
- A **Nexus Mods API key** — get one from [Nexus Mods API Settings](https://www.nexusmods.com/users/myaccount?tab=api+access)

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> lotd_validator
cd lotd_validator
pnpm install
pnpm approve-builds   # approve native deps (better-sqlite3, esbuild)
pnpm -r run build

# 2. Initialize config with your Nexus API key
npx tsx apps/cli/src/index.ts config-init --api-key "YOUR_NEXUS_API_KEY"

# 3. Download guide pages
npx tsx apps/cli/src/index.ts sync-guide

# 4. Parse into manifest
npx tsx apps/cli/src/index.ts build-manifest

# 5. Validate against Nexus API (uses API quota)
npx tsx apps/cli/src/index.ts validate

# 6. View your install queue
npx tsx apps/cli/src/index.ts queue
```

See [`docs/user-guide.md`](docs/user-guide.md) for the full walkthrough.

## Project Structure

```
lotd_validator/
├── apps/cli/                       # CLI entry point (lexy command)
├── packages/
│   ├── core-types/                 # Zod schemas for all domain types
│   ├── logger/                     # Pino structured logging
│   ├── guide-parser/               # HTML fetcher + cheerio parser
│   ├── nexus-resolver/             # Nexus API client + file matcher
│   ├── install-queue-engine/       # Manifest → ordered task queue
│   └── session-store/              # SQLite session persistence
├── docs/                           # Documentation
├── architecture.md                 # Full architecture spec
└── pnpm-workspace.yaml             # Monorepo config
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `config-init` | Create config with Nexus API key |
| `doctor` | Check config, cache, and DB health |
| `sync-guide` | Download/update cached guide HTML |
| `build-manifest` | Parse HTML → `manifest.json` |
| `validate` | Check files against Nexus API |
| `queue` | Show full install queue |
| `next` | Show the next task to work on |
| `show <id>` | Show details for a specific task |
| `mark-done <id>` | Mark a task as completed |
| `mark-blocked <id>` | Mark a task as blocked |
| `export-report` | Export session audit report |

## Configuration

Config is stored at `~/.lexy-assistant/config.json`:

```json
{
  "nexusApiKey": "YOUR_API_KEY",
  "guideBaseUrl": "https://lexyslotd.com/guide",
  "dataDir": "~/.lexy-assistant/data"
}
```

## Data Storage

All data is local to your machine:

| Path | Contents |
|------|----------|
| `data/guide-cache/` | Cached guide HTML pages |
| `data/manifests/` | Parsed `manifest.json` |
| `data/nexus-cache/` | Cached Nexus API responses |
| `data/sessions/` | SQLite session database |
| `data/validation-report.json` | Latest validation results |

## Tech Stack

TypeScript • Zod • Cheerio • pnpm workspaces • Commander • Pino • SQLite (better-sqlite3) • Bottleneck • p-retry

## License

MIT
