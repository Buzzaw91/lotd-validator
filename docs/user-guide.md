# User Guide

This guide walks you through the complete workflow for using the Lexy LOTD Validator — from initial setup to tracking your mod installation progress.

---

## Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [The Workflow](#the-workflow)
   - [Step 1: Sync the Guide](#step-1-sync-the-guide)
   - [Step 2: Build the Manifest](#step-2-build-the-manifest)
   - [Step 3: Validate Against Nexus](#step-3-validate-against-nexus)
   - [Step 4: Work the Queue](#step-4-work-the-queue)
   - [Step 5: Track Progress](#step-5-track-progress)
   - [Step 6: Observe MO2](#step-6-observe-mo2)
4. [Command Reference](#command-reference)
5. [Troubleshooting](#troubleshooting)

---

## Installation

### Prerequisites

- **Node.js 20+** — [download](https://nodejs.org/)
- **pnpm** — install via `npm install -g pnpm`
- **Nexus Mods API key** — get yours from [API Settings](https://www.nexusmods.com/users/myaccount?tab=api+access)

### Setup

```bash
cd lotd_validator
pnpm install
pnpm approve-builds          # approve native module builds
pnpm -r run build            # compile all packages
```

> **Tip:** All commands are run with `npx tsx apps/cli/src/index.ts <command>`. For brevity, the examples below use `lexy` as a shorthand alias.

---

## Configuration

Initialize your configuration with your Nexus API key:

```bash
lexy config-init --api-key "YOUR_NEXUS_API_KEY"
```

This creates `~/.lexy-assistant/config.json`:

```json
{
  "nexusApiKey": "YOUR_API_KEY",
  "guideBaseUrl": "https://lexyslotd.com/guide",
  "dataDir": "C:\\Users\\<you>\\.lexy-assistant\\data",
  "mo2": {
    "portableRoot": "C:\\Programs\\MO2"
  }
}
```

To verify your setup is healthy:

```bash
lexy doctor
# ✅ Everything looks good!
```

### Custom data directory

```bash
lexy config-init --api-key "..." --data-dir "D:\\Skyrim\\lexy-data"
```

### MO2 path

Point the tool at your MO2 portable instance during init:

```bash
lexy config-init --api-key "..." --mo2-path "C:\\Programs\\MO2"
```

Or add it manually to `config.json` under `"mo2": { "portableRoot": "..." }`.

---

## The Workflow

The tool follows a **pipeline** — each step feeds into the next:

```
sync-guide → build-manifest → validate → queue/next → mark-done
```

### Step 1: Sync the Guide

Download the latest Lexy guide HTML pages to your local cache:

```bash
lexy sync-guide
# Syncing guide pages to C:\Users\<you>\.lexy-assistant\data\guide-cache...
# ✅ 15 pages synced
```

This downloads all 15 guide pages (mod-installation parts 1–10, plus pre-installation, common tasks, merge page, finishing line, and MCM setup). Pages are cached locally and will only be re-downloaded if the server copy has changed.

### Step 2: Build the Manifest

Parse the cached HTML into a structured `manifest.json`:

```bash
lexy build-manifest
# Building manifest...
# ✅ Manifest built: 1308 tasks across 15 pages
```

The manifest contains every mod entry from the guide with:
- **Mod title** and section grouping
- **File entries** with category (Main, Update, Optional), filename, and version
- **FOMOD instructions** — which options to select in FOMOD installers
- **Special instructions** — post-install steps like file deletions or INI edits
- **Tags** — badges like "SKSE DLL", "MO2 Removal Tool", etc.
- **Nexus mod ID** — extracted from the download link

### Step 3: Validate Against Nexus

Check each mod's files against the Nexus Mods API to verify availability and version correctness:

```bash
lexy validate
# Validating against Nexus...
#
# 📊 Validation Summary:
#   ✅ Match:    987
#   ⚡ Partial:  201
#   ❌ Mismatch: 45
#   📦 Archived: 12
#   🔧 Manual:   63
#
# Report saved to ...\.lexy-assistant\data\validation-report.json
```

**Status meanings:**

| Status | Meaning |
|--------|---------|
| ✅ Match | File found, version matches exactly |
| ⚡ Partial | File found, but version or name differs slightly |
| ❌ Mismatch | File not found or version is very different |
| 📦 Archived | File exists but has been archived on Nexus |
| 🔧 Manual | Could not be verified automatically (no Nexus ID, non-Nexus source, etc.) |

> **Note:** Validation hits the Nexus API and is rate-limited to respect their hourly quota. The first run may take a while; subsequent runs use cached API responses.

### Step 4: Work the Queue

View the full install queue, ordered exactly as the guide presents it:

```bash
lexy queue
# 📋 Install Queue — 1308 tasks
#
# [1] .1130 _ResourcePack fixes
#     Section: Optimized Texture Baseline
#     Main Files — .1130 _ResourcePack Fixes  (v1.11)
#     Nexus: skyrimspecialedition/mods/117234
#     Status: ✅ Match
# ────────────────────────────────────────────────────
# [2] Project Clarity AIO - Skyrim Textures Redone
#     ...
```

To see just the **next task** you should work on:

```bash
lexy next
# 📌 Next Task:
# ...
```

To see **details** for a specific task by ID:

```bash
lexy show mod-installation-part-1-5
```

### Step 5: Track Progress

As you install each mod, mark it as done:

```bash
lexy mark-done mod-installation-part-1-0
# ✅ Task mod-installation-part-1-0 marked done
```

If a mod is unavailable or you need to revisit it later:

```bash
lexy mark-blocked mod-installation-part-1-5 --note "File archived on Nexus, waiting for re-upload"
# 🚧 Task mod-installation-part-1-5 marked blocked
```

When you run `lexy next` again, it will skip completed and blocked tasks and show you the next pending one.

### Exporting a Report

Generate a session audit report showing your progress:

```bash
lexy export-report
# 📊 Report exported to ...\.lexy-assistant\data\audit-report.json
#
# Summary:
#   done: 42
#   in_progress: 1
#   blocked: 3
#   todo: 1262
```

### Step 6: Observe MO2

If you have a Mod Organizer 2 portable instance, the tool can read it to automatically detect which guide mods are already installed:

```bash
lexy observe --mo2-path "C:\Programs\MO2"
# Scanning MO2 instance...
#
# 🔍 MO2 Observer Snapshot
#    Profile: Default
#    Path: C:\Programs\MO2
#
# 📊 Summary
#    Installed mods: 247
#    Matched tasks: 203
#    Unmatched MO2 mods: 12
#    Missing from MO2: 1105
#
# 🔗 Match Methods
#    Nexus ID: 185
#    Exact name: 11
#    Fuzzy name: 7
```

If you configured `mo2.portableRoot` in your config, you can omit the flag:

```bash
lexy observe
```

To use a different MO2 profile:

```bash
lexy observe --profile "My Custom Profile"
```

For machine-readable output:

```bash
lexy observe --json > snapshot.json
```

The observer is **completely read-only** — it never writes to MO2. It matches by:
1. **Nexus mod ID** (from `meta.ini`) — most reliable
2. **Exact mod name** (normalized, case-insensitive)
3. **Fuzzy matching** (word overlap for renamed mods)

---

## Command Reference

### `config-init`

Create or overwrite the configuration file.

```
lexy config-init --api-key <key> [--data-dir <path>] [--mo2-path <path>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--api-key` | Yes | Your Nexus Mods API key |
| `--data-dir` | No | Custom data directory (default: `~/.lexy-assistant/data`) |
| `--mo2-path` | No | Path to MO2 portable instance |

### `doctor`

Check the health of your configuration, data directories, and API key.

```
lexy doctor
```

### `sync-guide`

Download or refresh cached copies of the Lexy guide HTML pages.

```
lexy sync-guide
```

### `build-manifest`

Parse cached guide HTML into a structured `manifest.json`.

```
lexy build-manifest
```

### `validate`

Validate manifest entries against the Nexus Mods API. Produces `validation-report.json`.

```
lexy validate
```

### `queue`

Display the full install queue with validation status.

```
lexy queue
```

### `next`

Show the next pending task.

```
lexy next [--session <id>]
```

### `show <taskId>`

Display detailed information for a specific task.

```
lexy show <taskId>
```

### `mark-done <taskId>`

Mark a task as completed.

```
lexy mark-done <taskId> [--session <id>]
```

### `mark-blocked <taskId>`

Mark a task as blocked.

```
lexy mark-blocked <taskId> [--session <id>] [--note <text>]
```

### `export-report`

Export an audit report of your session progress.

```
lexy export-report [--session <id>]
```

### `observe`

Scan MO2 installed mods and compare against the guide manifest.

```
lexy observe [--mo2-path <path>] [--profile <name>] [--json]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--mo2-path` | Config value | Path to MO2 portable instance |
| `--profile` | `Default` | MO2 profile to inspect |
| `--json` | — | Output raw JSON snapshot |

---

## Troubleshooting

### "Config file not found"

Run `lexy config-init --api-key "..."` to create the config file.

### "0 pages synced"

- Check your internet connection
- Run `lexy doctor` to verify config
- The guide site may be temporarily down

### Validation is slow

The Nexus API is rate-limited. Results are cached in `data/nexus-cache/` — subsequent runs will be much faster. If you hit the hourly limit, wait and retry.

### Build errors after `git pull`

```bash
pnpm install
pnpm -r run build
```

### Task IDs

Task IDs follow the pattern `<page-slug>-<index>`, for example:
- `mod-installation-part-1-0` — first mod on part 1
- `mod-installation-part-3-15` — sixteenth mod on part 3
- `finishing-line-2` — third task on the finishing line page

Use `lexy queue` to see all task IDs.
