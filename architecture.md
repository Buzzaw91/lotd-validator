# Lexy LOTD Download & Validation Assistant

## Architecture Document (Node/TypeScript)

## 1. Overview

This project is a **validation-first install companion** for **Lexy's Legacy of the Dragonborn (LOTD)** mod guide.

The assistant does **not** try to fully automate Skyrim mod installation. Instead, it automates the parts that are repetitive and error-prone:

- Parsing the guide into a structured task list
- Resolving and validating required mod files and versions
- Tracking progress across long install sessions
- Presenting a clean, step-by-step install queue for MO2
- Reducing mistakes around file versions, file categories, and install order

The user remains in control for all fragile or stateful actions (especially FOMOD choices and in-tool patching steps).

---

## 2. Goals and Rationale

### 2.1 Primary goals

1. **Reduce install errors**
   - Prevent wrong version / wrong file downloads
   - Surface archived file requirements early
   - Prevent confusion about Main vs Update vs Optional install behavior

2. **Reduce cognitive load**
   - Convert a huge guide into a structured queue
   - Present one mod/task at a time with all relevant details
   - Preserve context across breaks and multi-day installs

3. **Improve repeatability**
   - Produce an auditable record of what was installed
   - Reuse validated downloads across future reinstalls
   - Make the process deterministic and restartable

4. **Stay reliable by design**
   - Validation-first architecture (do not guess silently)
   - Human-in-the-loop at critical decision points
   - Strong schema validation and logging

### 2.2 Non-goals (Phase 1)

- Fully autonomous MO2 GUI control
- Automatic FOMOD selection/clicking
- Automatic execution of xEdit / CAO / Nemesis / Wrye Bash / Synthesis / DynDOLOD / zMerge
- Conflict resolution or patch generation logic
- Replacing the guide itself

---

## 3. Product Vision

A local desktop/CLI assistant that helps the user get from:

- “I have a fresh Skyrim + MO2 setup”

To:

- “I have a validated, guide-ordered list of archives and a structured MO2 install workflow I can follow confidently.”

This project is best thought of as a:

- **Parser** + **Validator** + **Checklist Engine** + **Progress Tracker**

not a game mod installer.

---

## 4. Design Principles

### 4.1 Deterministic over clever
Use rule-based parsing and validation first. Avoid LLM-style guessing for core logic.

### 4.2 Fail loud, not silent
Any ambiguity (file mismatch, version mismatch, multiple candidates) must produce a visible warning and require user confirmation.

### 4.3 Human-in-the-loop for fragile steps
FOMOD selections, tool outputs, and in-game setup remain supervised.

### 4.4 Resume-safe by default
Every meaningful action should persist state immediately.

### 4.5 Local-first
Run locally on the user’s machine. Keep Nexus API keys local. No cloud service required.

---

## 5. High-Level Architecture

```text
+-------------------+
|   Lexy Guide      |
|  (guide/* pages)  |
+---------+---------+
          |
          v
+-------------------+        +-------------------+
|   guide-parser    |------->|   GuideManifest   |
| (HTML -> tasks)   |        | (JSON + schemas)  |
+---------+---------+        +-------------------+
          |
          v
+-------------------+        +-------------------+
|  nexus-resolver   |------->| ValidationRecords |
| (API + matching)  |        | + archive flags   |
+---------+---------+        +-------------------+
          |
          v
+-------------------+        +-------------------+
| install-queue     |------->| Session Store     |
| engine            |        | (SQLite)          |
+---------+---------+        +-------------------+
          |
          v
+-------------------+
| assistant-ui      |
| (CLI first)       |
+---------+---------+
          |
          v
+-------------------+
|   User + MO2      |
| (manual install)  |
+-------------------+
```

---

## 6. Core Components

## 6.1 `guide-parser`

### Responsibilities
- Fetch or load cached Lexy guide HTML pages
- Parse pages into structured tasks
- Extract file entries, versions, tags, FOMOD blocks, special instructions
- Normalize task order across all pages
- Validate parsed output against TypeScript/Zod schemas

### Inputs
- Raw HTML snapshots from `guide/*`

### Outputs
- `GuideManifest`
- Parse diagnostics (warnings/errors)

### Notes
- Parsing should be deterministic using CSS selectors / text patterns.
- Keep raw HTML snapshots for reproducibility and parser debugging.
- Include page + section source references in parsed tasks.

---

## 6.2 `nexus-resolver`

### Responsibilities
- Resolve Nexus mod IDs / file IDs from guide links
- Query Nexus metadata (v1 REST first)
- Match guide file requirements to Nexus file entries
- Detect archived file requirements
- Cache metadata and enforce request throttling

### Inputs
- `GuideManifest`
- User Nexus API key

### Outputs
- `ValidationRecord[]`
- Resolution cache
- Validation reports

### Matching behavior
- Attempt exact filename + version match first
- Fall back to fuzzy filename matching with confidence scoring
- Never silently accept a mismatch
- Mark archived requirements explicitly

### Reliability rules
- Rate limit requests
- Retry with backoff for transient errors
- Cache aggressively to avoid repeated API calls

---

## 6.3 `install-queue-engine`

### Responsibilities
- Convert parsed guide entries into actionable install tasks
- Determine install mode hints:
  - `NEW` (Main)
  - `MERGE` (Update into parent mod)
  - `SEPARATE` (Optional / Misc / Old)
  - `MANUAL` / `TOOL_TASK` for non-standard steps
- Build a queue ordered by guide sequence
- Attach validation results and guidance text to each task

### Inputs
- `GuideManifest`
- `ValidationRecord[]`

### Outputs
- Ordered `QueueTask[]`

### Key behavior
- Preserve exact guide order
- Track parent-child relationships (Main + Update)
- Surface FOMOD instructions and special instructions inline

---

## 6.4 `session-store`

### Responsibilities
- Persist user progress and decisions
- Store validations, confirmations, notes, and timestamps
- Support pause/resume over long sessions
- Produce audit exports

### Storage
- SQLite (`better-sqlite3`)

### Typical stored data
- Task status (`todo`, `in_progress`, `done`, `blocked`, `skipped`)
- Matched Nexus file/version
- Local archive path + optional hash
- User confirmations (FOMOD complete, special instructions complete)
- Freeform notes (e.g., “used archived file manually”)

---

## 6.5 `assistant-ui` (CLI first)

### Responsibilities
- Present queue and current task cleanly
- Show validation warnings and required actions
- Allow state transitions (mark done / blocked / skipped)
- Export reports

### UI strategy
Phase 1 uses a CLI/TUI because it is:
- Faster to build
- Easy to script/test
- Low maintenance

A web UI can be added later without changing core logic.

### Example commands
- `lexy sync-guide`
- `lexy build-manifest`
- `lexy validate`
- `lexy queue`
- `lexy next`
- `lexy show <taskId>`
- `lexy mark-done <taskId>`
- `lexy mark-blocked <taskId>`
- `lexy doctor`
- `lexy export-report`

---

## 6.6 `mo2-observer` (optional, Phase 1.5)

### Responsibilities
Read MO2 filesystem state (passively) to improve confidence:

- Detect whether expected archives exist in MO2 downloads folder
- Detect installed mod folders
- Detect profile files (`modlist.txt`, `plugins.txt`) and plugin presence
- Warn when likely installation drift occurs

### Important boundary
This component is **read-only** in Phase 1.5. It does not click MO2 or mutate files.

---

## 7. Data Flow

## 7.1 Build manifest flow
1. `sync-guide` downloads/caches Lexy guide pages
2. `build-manifest` parses HTML snapshots into `GuideManifest`
3. Parser writes warnings for ambiguous or failed sections

## 7.2 Validation flow
1. `validate` iterates manifest tasks
2. `nexus-resolver` resolves file metadata
3. Matches are stored as `ValidationRecord`
4. Mismatches/archive requirements become actionable queue warnings

## 7.3 Install companion flow
1. User runs `lexy next`
2. Assistant shows task details (file/version/install mode/FOMOD/special instructions)
3. User performs action in MO2
4. User confirms completion
5. Assistant updates SQLite state and advances

---

## 8. Domain Model

## 8.1 Core types (TypeScript)

```ts
export type GuideManifest = {
  generatedAt: string;
  guideVersionLabel?: string;
  pages: GuidePage[];
  tasks: InstallTask[];
};

export type GuidePage = {
  slug: string;
  title: string;
  sourceUrl: string;
  localPath: string;
  parsedAt: string;
};

export type InstallTask = {
  id: string;
  orderIndex: number;
  pageSlug: string;
  sectionTitle: string;
  modTitle: string;
  tags: string[];
  fileEntries: GuideFileEntry[];
  fomod?: FomodInstruction[];
  specialInstructions?: string[];
  installModeHint: "NEW" | "MERGE" | "SEPARATE" | "TOOL_TASK" | "MANUAL";
  sourceRefs: SourceRef[];
};

export type GuideFileEntry = {
  fileCategory: "MAIN" | "UPDATE" | "OPTIONAL" | "MISC" | "OLD" | "UNKNOWN";
  labelText: string;
  expectedFileName?: string;
  expectedVersion?: string;
  sourceUrl?: string;
  nexusModId?: number;
  nexusFileId?: number;
};

export type FomodInstruction = {
  stepLabel?: string;
  selections: string[];
};

export type SourceRef = {
  pageSlug: string;
  locatorText?: string;
};

export type ValidationRecord = {
  taskId: string;
  fileEntryIndex: number;
  status: "MATCH" | "PARTIAL" | "MISMATCH" | "ARCHIVED_REQUIRED" | "MANUAL";
  confidence: number;
  nexusModId?: number;
  matchedFileId?: number;
  matchedFileName?: string;
  matchedVersion?: string;
  notes: string[];
};
```

## 8.2 Session state types

```ts
export type TaskStatus = "todo" | "in_progress" | "done" | "blocked" | "skipped";

export type SessionTaskState = {
  taskId: string;
  status: TaskStatus;
  startedAt?: string;
  completedAt?: string;
  matchedFiles?: Array<{
    fileEntryIndex: number;
    localArchivePath?: string;
    localHash?: string;
    nexusFileId?: number;
    version?: string;
  }>;
  confirmations?: {
    fomodCompleted?: boolean;
    specialInstructionsCompleted?: boolean;
  };
  notes?: string[];
};
```

---

## 9. Repository Structure

```text
lexy-assistant/
  apps/
    cli/
      src/
        commands/
        ui/
        index.ts
  packages/
    core-types/
      src/
    guide-parser/
      src/
    nexus-resolver/
      src/
    install-queue-engine/
      src/
    session-store/
      src/
    mo2-observer/
      src/
    logger/
      src/
  data/
    guide-cache/
    manifests/
    sessions/
  docs/
    architecture.md
    parser-rules.md
    validation-rules.md
    cli-spec.md
  scripts/
    sync-guide.ts
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
```

### Notes
- Use a monorepo to keep parser, resolver, and CLI modular.
- Keep `core-types` and schemas shared across packages.
- All generated artifacts should be easy to inspect (JSON/SQLite/logs).

---

## 10. Technology Choices

## 10.1 Runtime and language
- **Node.js 20 LTS**
- **TypeScript 5.x**

## 10.2 Recommended libraries

### Core
- `typescript`
- `zod` (runtime validation)
- `pino` (structured logging)

### Parsing
- `cheerio` (HTML parsing)
- `undici` (HTTP client for fetching guide pages)

### Nexus + networking
- `undici`
- `bottleneck` (rate limiting)
- `p-retry` (retry/backoff)

### Persistence
- `better-sqlite3` (session store)

### CLI
- `commander` or `yargs`
- `chalk` (optional formatting)
- `ora` (optional spinners)

### Optional utilities
- `chokidar` (watch MO2 dirs)
- `node-7z` or external 7zip integration for archive inspection
- `fast-glob` (filesystem scans)

---

## 11. Parsing Strategy

## 11.1 Deterministic parser first
The guide should be parsed using explicit rules and selectors, not an LLM. This improves reliability and testability.

## 11.2 Parsing responsibilities
For each guide page, extract:
- Section/mod title
- Tags
- File entries (Main / Update / Optional / Misc / Old)
- Version text
- Source links (Nexus and others)
- FOMOD instruction blocks
- Special Instructions blocks

## 11.3 Parser outputs
- Parsed task list
- Parser warnings (e.g., “could not parse file version line”)
- Raw snippet references for troubleshooting

## 11.4 Parser testing
Create fixture-based tests using saved HTML samples:
- "happy path" pages
- edge-case pages with unusual formatting
- pages with missing/changed structures

---

## 12. Validation Strategy

## 12.1 Validation tiers

### Tier 1 — Metadata-only validation
Validate that the guide’s expected file/version exists in Nexus metadata.

### Tier 2 — Archived-aware validation
If the required version is older than latest:
- mark `ARCHIVED_REQUIRED`
- surface clear user guidance
- do not auto-substitute newer files

### Tier 3 — Local archive validation (optional in Phase 1)
After the file is downloaded:
- verify filename pattern
- optionally inspect archive contents (plugins/DLLs)

### Tier 4 — MO2 state validation (Phase 1.5)
Check whether the task appears installed in MO2 filesystem state.

## 12.2 Matching rules (ordered)
1. Exact `nexusFileId` match (if known)
2. Exact filename + exact version match
3. Exact version + fuzzy filename match
4. Filename-only candidate list (manual confirmation required)
5. Fail with `MISMATCH` / `MANUAL`

## 12.3 Confidence scoring
Use simple confidence buckets:
- `1.0` exact match
- `0.7–0.9` strong partial match (needs review)
- `<0.7` manual selection required

Never auto-accept a non-exact match.

---

## 13. Queue and Task Orchestration

## 13.1 Install mode mapping
Map file categories to install hints:

- `MAIN` -> `NEW`
- `UPDATE` -> `MERGE`
- `OPTIONAL` -> `SEPARATE`
- `MISC` -> `SEPARATE`
- `OLD` -> `SEPARATE`
- Non-file procedural items -> `TOOL_TASK` / `MANUAL`

## 13.2 Task UI payload
Every task shown to the user should include:
- Mod title
- Page and order reference
- Tags
- Expected file(s) and versions
- Validation status
- Install mode hint
- FOMOD selections (if any)
- Special instructions (if any)
- Notes / warnings

## 13.3 Task state transitions
Allowed transitions:
- `todo -> in_progress`
- `in_progress -> done`
- `in_progress -> blocked`
- `blocked -> in_progress`
- `todo -> skipped` (explicit)
- `skipped -> in_progress`

All transitions must be logged with timestamp.

---

## 14. MO2 Integration Boundary

## 14.1 Phase 1 boundary
The assistant does not automate MO2. It only assists and validates.

## 14.2 Phase 1.5 passive observer
Read-only support may include:
- Checking for expected archives in `downloads/`
- Checking installed mod folders in `mods/`
- Checking profile plugin lists (`plugins.txt`, `modlist.txt`)

## 14.3 Why this boundary matters
MO2 + FOMOD flows are fragile and can fail silently if automated incorrectly. Keeping Phase 1 human-driven prevents hard-to-debug downstream issues.

---

## 15. Persistence and Auditing

## 15.1 SQLite schema (conceptual)
Tables:
- `sessions`
- `tasks`
- `task_states`
- `validations`
- `events`
- `settings`

## 15.2 Event log examples
- `TASK_STARTED`
- `VALIDATION_MATCHED`
- `VALIDATION_ARCHIVED_REQUIRED`
- `TASK_COMPLETED`
- `TASK_BLOCKED`
- `NOTE_ADDED`

## 15.3 Audit report output
Export a report containing:
- Completed tasks
- Blocked/skipped tasks
- File/version matches used
- Manual overrides
- Timestamps

Useful for reinstall attempts and troubleshooting.

---

## 16. Configuration

## 16.1 Local config file
Example: `~/.lexy-assistant/config.json`

```json
{
  "nexusApiKey": "<local-only>",
  "guideBaseUrl": "https://lexyslotd.com/guide/",
  "dataDir": "C:/Users/<you>/Documents/lexy-assistant/data",
  "mo2": {
    "portableRoot": "D:/Modding/MO2",
    "downloadsDir": "D:/Modding/MO2/downloads",
    "modsDir": "D:/Modding/MO2/mods",
    "profilesDir": "D:/Modding/MO2/profiles"
  }
}
```

## 16.2 Config rules
- Keep API keys local and out of source control
- Validate config on startup
- Provide `lexy config doctor` command for path checks

---

## 17. Logging and Diagnostics

## 17.1 Logging goals
- Make parser and resolver behavior easy to debug
- Help identify why a task was marked mismatched/blocked
- Support issue reproduction

## 17.2 Logging strategy
Use structured JSON logs (`pino`) with levels:
- `debug` (parser details, candidate files)
- `info` (normal operations)
- `warn` (ambiguous match, parser fallback)
- `error` (request failures, corrupted manifest)

## 17.3 Diagnostics commands
- `lexy doctor` (config, DB, cache health)
- `lexy parser-debug <page>` (show parser extraction details)
- `lexy validate --task <id> --verbose`

---

## 18. Error Handling Strategy

## 18.1 Network failures
- Retry with exponential backoff
- Preserve partial progress
- Mark tasks unresolved instead of crashing session

## 18.2 Parser failures
- Emit warning with source page + snippet reference
- Continue parsing other tasks
- Mark failed sections for manual review

## 18.3 Validation ambiguity
- Present candidate list and require explicit user choice
- Record manual override in audit log

## 18.4 State corruption
- Use migrations for SQLite schema changes
- Add backup command: `lexy backup-session`

---

## 19. Security and Compliance Notes

- Store Nexus API key only in local config or OS keychain (future enhancement)
- Never log API keys
- Respect Nexus rate limits and acceptable use constraints
- Do not redistribute mod files or mirror downloads
- Keep the tool local/private by default

---

## 20. Milestone Plan

## Milestone 1 — Parser MVP
### Deliverables
- `sync-guide` command
- HTML cache
- `build-manifest` command
- `manifest.json` output
- Parser test fixtures

### Exit criteria
- Parses core Lexy mod-install pages into task records
- Emits deterministic output

---

## Milestone 2 — Validation MVP
### Deliverables
- Nexus API client (v1 REST)
- Resolver + matcher
- Cache + throttling
- `validate` command
- `validation-report.json`

### Exit criteria
- Can validate most file/version entries
- Flags archived requirements and mismatches clearly

---

## Milestone 3 — CLI Install Companion
### Deliverables
- SQLite session store
- `queue`, `next`, `show`, `mark-done`, `mark-blocked` commands
- Task rendering with FOMOD + special instructions
- Event/audit log

### Exit criteria
- User can drive an install session with pause/resume support

---

## Milestone 4 — MO2 Passive Observer (Optional)
### Deliverables
- MO2 path validation
- Downloads/mods/profile file checks
- Warning system for drift/missing files

### Exit criteria
- Assistant can verify some user actions without manual bookkeeping

---

## Milestone 5 — Advanced Validations (Optional)
### Deliverables
- Local archive inspection
- Enhanced candidate matching
- Per-task validation confidence tuning

### Exit criteria
- Better confidence with fewer manual checks

---

## 21. Agent Implementation Guidance

If an AI coding agent is used to build this project, it should follow these rules:

1. **Use schemas everywhere**
   - Parse outputs and persisted state must be validated via `zod`

2. **Never silently substitute files**
   - Any non-exact match becomes a warning/manual choice

3. **Prefer test fixtures for parser work**
   - Save HTML samples and write parser tests before refactors

4. **Keep side effects isolated**
   - Parser, resolver, queue engine, and storage should be separate packages

5. **Preserve source references**
   - Every parsed task should retain page/source context for debugging

6. **Log manual overrides**
   - If user chooses a non-exact file, write an event

7. **No MO2 GUI automation in Phase 1**
   - Stay within the architecture boundary

---

## 22. Definition of Done (Phase 1)

Phase 1 is complete when the tool can:

- Parse Lexy guide pages into a structured queue
- Validate Nexus files/versions for queue tasks
- Flag archive-required and mismatch cases
- Present one task at a time with:
  - file/version
  - install mode hint
  - FOMOD text
  - special instructions
- Track progress over multiple sessions
- Export a useful audit log/report

At that point, the assistant is already valuable for repeat installs and significantly reduces risk.

---

## 23. Future Extensions

Potential Phase 2+ enhancements:

- Local web UI (React/Vite)
- MO2 passive observer improvements (plugin activation checks)
- Archive content inspection (7z/zip checks)
- Guided tool-task checklists (Nemesis/Synthesis/DynDOLOD phases)
- Import/export of reusable validated download cache catalogs
- Optional "strict mode" that blocks progression on unresolved validation

---

## 24. Recommended First Repo Tasks

1. Initialize monorepo (`pnpm` workspace)
2. Create `core-types` package with schemas and types
3. Implement `sync-guide` + HTML cache
4. Implement parser for one guide page and add tests
5. Expand parser to all mod-installation pages
6. Add manifest export
7. Add Nexus resolver package + one validation command
8. Add SQLite session store
9. Add `next` / `mark-done` CLI flow

This sequence gets you to a usable tool quickly while keeping architecture clean.

---

## 25. Summary

This architecture deliberately optimizes for **reliability, repeatability, and human supervision**.

It avoids the trap of over-automating the fragile parts of Skyrim modding while still cutting a large amount of repetitive work from Lexy installs. The result is a practical, local-first companion that can be used repeatedly and improved incrementally.
