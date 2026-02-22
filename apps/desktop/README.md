# Lexy LOTD Desktop GUI

An Electron desktop application for managing your Lexy's LOTD Skyrim SE mod installation. Provides a visual interface for guide syncing, validation, downloading, and MO2 inspection.

## Tech Stack

- **Electron** — Desktop application shell
- **React 19** — UI framework
- **Vite** — Build tooling with HMR
- **Tailwind CSS 3** — Utility-first styling
- **xterm.js 6** — Integrated terminal for live CLI output

## Getting Started

```bash
# From the workspace root
pnpm install
pnpm -r run build

# Launch the desktop app in dev mode
cd apps/desktop
pnpm dev
```

The Electron window will open with a Vite dev server and hot-reload enabled.

## Features

### Validator Tab
- **Sync Guide** — Download the latest guide pages from lexyslotd.com
- **Build Manifest** — Parse cached HTML into a structured manifest
- **Validate Files** — Check mod files against the Nexus API with live progress

### Downloader Tab
- **Load Sections** — Fetches all guide sections into a scrollable radio selector
- **Preview / Download** — Dry-run or download files for the selected section
- **Next Pending** — Resume from where the session store left off

### MO2 Observer Tab
- **Run MO2 Inspection** — Reads your MO2 portable instance, compares installed mods against the guide manifest, and reports matched/unmatched/missing entries

### Terminal
- Live streaming output with ANSI color support
- **Ctrl+C** copies selected text to clipboard
- Right-click selects the word under cursor

## Architecture

```
apps/desktop/
├── electron/
│   ├── main.ts          # Electron main process, IPC handlers
│   └── preload.ts       # CJS contextBridge for renderer ↔ main IPC
├── src/
│   ├── App.tsx          # Main React component with tabs + terminal
│   ├── main.tsx         # React entry point
│   ├── index.css        # Tailwind directives + base styles
│   └── types.d.ts       # Window.electronAPI type declarations
├── vite.config.ts       # Vite + vite-plugin-electron config
├── tailwind.config.js   # Tailwind content paths
└── postcss.config.js    # PostCSS with Tailwind + Autoprefixer
```

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `run-command` | Renderer → Main | Execute CLI command, stream output |
| `capture-command` | Renderer → Main | Execute CLI command, return stdout as string |
| `command-stdout` | Main → Renderer | Stream stdout chunks |
| `command-stderr` | Main → Renderer | Stream stderr chunks |

## Building for Production

```bash
pnpm build          # Compiles TypeScript + bundles with Vite
npx electron-builder  # Package as distributable (not yet configured)
```
