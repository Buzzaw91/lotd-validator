# Developer Guide

Architecture overview and contribution guide for the Lexy LOTD Validator.

---

## Monorepo Layout

The project uses **pnpm workspaces** with packages in `packages/` and apps in `apps/`:

```
packages/
├── core-types      # Zod schemas, shared TypeScript types
├── logger          # Thin pino wrapper (createLogger)
├── guide-parser    # HTML sync + cheerio parser + manifest builder
├── nexus-resolver  # Nexus API client + file matcher + resolver
├── install-queue-engine  # Manifest → QueueTask[]
└── session-store   # SQLite persistence

apps/
└── cli             # Commander-based CLI entry point
```

### Dependency Graph

```
cli
 ├── guide-parser → core-types, logger
 ├── nexus-resolver → core-types, logger
 ├── install-queue-engine → core-types
 └── session-store → core-types
```

All inter-package imports use workspace protocol (`workspace:*`) in `package.json`.

---

## Building

```bash
pnpm install
pnpm -r run build    # compiles all packages with tsc
```

Each package compiles from `src/` to `dist/` using the shared `tsconfig.base.json`:
- `module: "ESNext"`, `moduleResolution: "bundler"`
- `strict: true`, `skipLibCheck: true`

---

## Package Details

### `@lexy/core-types`

All shared Zod schemas and inferred TypeScript types. No runtime dependencies (only `zod`).

**Key types:**
- `GuideManifest` — the complete parsed guide (pages + tasks)
- `InstallTask` — one mod entry with file entries, FOMOD, and special instructions
- `GuideFileEntry` — a single downloadable file (category, name, version, Nexus IDs)
- `ValidationRecord` — result of validating a file against Nexus API
- `SessionTaskState` — task progress state with transitions
- `QueueTask` — rendered work item for the CLI

### `@lexy/guide-parser`

Three modules:

1. **`sync-guide.ts`** — Fetches guide HTML pages using `undici`, caches to disk with 24h freshness TTL.

2. **`parser.ts`** — Cheerio-based parser targeting the `lotd-plus` WordPress plugin DOM. The key CSS selector is `div.mod-item`, which wraps each mod entry. Sub-selectors extract:
   - `h3.av-special-heading-tag` → mod title
   - `span.mod-file-item` → file entries (category, name, version)
   - `div.fomod-toggle` → FOMOD carousel instructions
   - `div.mod-special-instructions` → special post-install steps
   - `span.lotd-shield-searchable` → tags
   - `h2.av-special-heading-tag` → section headings

3. **`manifest-builder.ts`** — Aggregates parsed pages into `GuideManifest`, validates with Zod, writes JSON.

### `@lexy/nexus-resolver`

- **`nexus-client.ts`** — Nexus Mods v1 REST API client using `undici`. Rate-limited to 25 req/sec via `bottleneck`. Retries transient failures with `p-retry`.
- **`metadata-cache.ts`** — On-disk JSON cache for API responses with configurable TTL.
- **`file-matcher.ts`** — 5-tier matching pipeline (exact file ID → filename+version → version+fuzzy → fuzzy only → fallback). Produces a confidence score.
- **`resolver.ts`** — Orchestrates caching + API calls + matching to produce `ValidationRecord[]`.

### `@lexy/install-queue-engine`

- **`queue-builder.ts`** — Merges `InstallTask[]` with `ValidationRecord[]` to produce `QueueTask[]`.
- **`task-renderer.ts`** — Formats `QueueTask` into human-readable CLI output with status icons.

### `@lexy/session-store`

SQLite-backed persistence using `better-sqlite3`:
- Task state machine: `todo → in_progress → done | blocked`
- Event/audit log for all transitions
- Session management (create, resume, export report)

---

## Extending the Parser

If the guide HTML structure changes, update `packages/guide-parser/src/parser.ts`:

1. Re-run `lexy sync-guide` to get fresh HTML
2. Inspect the cached HTML in `~/.lexy-assistant/data/guide-cache/`
3. Update the CSS selectors in `parseHtml()` and the extraction helpers
4. Run `lexy build-manifest` to verify extraction count
5. Rebuild: `pnpm -r run build`

---

## Data Flow

```
Lexy Guide (HTML)
       │
       ▼
  sync-guide     → guide-cache/*.html
       │
       ▼
  build-manifest → manifests/manifest.json (GuideManifest)
       │
       ▼
  validate       → validation-report.json (ValidationRecord[])
       │
       ▼
  queue / next   → QueueTask[] (rendered to CLI)
       │
       ▼
  mark-done/blocked → sessions/session.db (SQLite)
       │
       ▼
  export-report  → audit-report.json
```

---

## Adding a New CLI Command

1. Add the command in `apps/cli/src/index.ts` using `program.command(...)`
2. Import any package functions needed
3. Rebuild: `pnpm -r run build`
4. Test: `npx tsx apps/cli/src/index.ts <your-command>`
