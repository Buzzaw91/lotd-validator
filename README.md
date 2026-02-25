# Lexy LOTD Validator

A companion tool for following [Lexy's Legacy of the Dragonborn](https://lexyslotd.com/) Skyrim SE modding guide. It parses the guide, validates mod files against the Nexus Mods API, and provides a step-by-step install queue to track your progress. Available as both a CLI and an Electron desktop GUI.

## What It Does

1. **Parses** the Lexy guide HTML into a structured manifest of 1,300+ mod tasks
2. **Validates** each mod's files against the Nexus Mods API (correct version, file availability)
4. **Downloads** files directly from Nexus Premium API to MO2, organized by guide section
5. **Queues** tasks in install order with file categories, FOMOD instructions, and special steps
6. **Tracks** your progress with a local SQLite session (mark-done, mark-blocked)
7. **Updates** smartly when the guide changes (State Diffing Engine) to preserve progress
8. **Reports** on validation confidence, mismatches, and archived files
9. **Observes** your MO2 instance to detect which mods are already installed

## Desktop GUI

A graphical interface built with Electron, React, and Tailwind CSS. It wraps the CLI and streams output into an integrated xterm.js terminal.

```bash
# Launch the desktop app
cd apps/desktop
pnpm dev
```

- **Validator tab** — Sync guide, build manifest, validate with live progress indicators
- **Downloader tab** — Scrollable section selector with preview/download actions
- **MO2 Observer tab** — One-click inspection of your MO2 instance
- **Integrated terminal** — Live streaming output with ANSI colors, Ctrl+C copy support

See [`apps/desktop/README.md`](apps/desktop/README.md) for full details.

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
├── apps/
│   ├── cli/                        # CLI entry point (lexy command)
│   └── desktop/                    # Electron + React + Tailwind GUI
├── packages/
│   ├── core-types/                 # Zod schemas for all domain types
│   ├── logger/                     # Pino structured logging
│   ├── guide-parser/               # HTML fetcher + cheerio parser
│   ├── nexus-resolver/             # Nexus API client + file matcher
│   ├── mod-downloader/             # Premium API section-based downloader
│   ├── install-queue-engine/       # Manifest → ordered task queue
│   ├── session-store/              # SQLite session persistence
│   └── mo2-observer/               # Read-only MO2 state inspector
├── docs/                           # Documentation
├── architecture.md                 # Full architecture spec
└── pnpm-workspace.yaml             # Monorepo config
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `config-init` | Create config with Nexus API key |
| `doctor` | Check config, cache, and DB health |
| `preinstall-check` | Check system prerequisites and tools |
| `preinstall-setup` | Extract and deploy preinstallation archives |
| `sync-guide` | Download/update cached guide HTML |
| `build-manifest` | Parse HTML → `manifest.json` |
| `validate` | Check files against Nexus API |
| `download` | Auto-download files (Premium only) |
| `queue` | Show full install queue |
| `next` | Show the next task to work on |
| `show <id>` | Show details for a specific task |
| `mark-done <id>` | Mark a task as completed |
| `mark-blocked <id>` | Mark a task as blocked |
| `observe` | Compare MO2 installed mods against manifest |
| `export-report` | Export session audit report |

## Configuration

Config is stored at `~/.lexy-assistant/config.json`:

```json
{
  "nexusApiKey": "YOUR_API_KEY",
  "guideBaseUrl": "https://lexyslotd.com/guide",
  "dataDir": "~/.lexy-assistant/data",
  "mo2": {
    "portableRoot": "C:\\Programs\\MO2"
  }
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
| `data/mo2-snapshot.json` | Latest MO2 observer snapshot |

## Tech Stack

TypeScript • Electron • React • Vite • Tailwind CSS • xterm.js • Zod • Cheerio • pnpm workspaces • Commander • Pino • SQLite (better-sqlite3) • Bottleneck • p-retry

## License

MIT
