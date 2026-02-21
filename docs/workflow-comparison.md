# Workflow Comparison: Manual vs Tool-Assisted LOTD Guide Installation

This guide compares the traditional manual approach to following Lexy's Legacy of the Dragonborn guide with the tool-assisted workflow using the LOTD Validator.

---

## Overview

Lexy's LOTD SE guide covers **1,300+ mods** across 15 web pages, with specific file versions, FOMOD installer choices, and post-install steps for each. Completing the guide from scratch is a multi-day commitment even for experienced modders — and mistakes are easy when manually tracking hundreds of mods across page after page of instructions.

---

## The Manual Workflow

Without the tool, here's what the typical modding experience looks like:

### 1. Read the Guide Page by Page

Open each of the 15 guide pages in your browser. Scroll through dense HTML, locate each mod entry, and read the instructions for each one. You have to mentally track where you left off.

### 2. Download Files From Nexus

For each mod, click the Nexus link, navigate to the correct file tab, find the exact file (Main Files / Update Files / Optional Files), and download the right version. This involves:
- Confirming you're downloading the correct file category
- Checking the version matches what the guide expects
- Waiting for Nexus page loads and download redirects (especially on free accounts)

### 3. Install in MO2 and Follow FOMOD Steps

Install through MO2, and if it has a FOMOD wizard, follow the guide's FOMOD instructions step-by-step. You need to find the right section on the guide page, match it to the FOMOD page you're looking at, and select the correct options. Errors here can be subtle and hard to catch later.

### 4. Handle Special Instructions

Some mods require post-install work: deleting specific files, editing INI settings, running tools, or hiding assets. These special instructions are easy to miss in the wall of text.

### 5. Track Your Progress Manually

There's no built-in progress tracking. Most people:
- Use a notepad or spreadsheet to tick off completed mods
- Rely on browser tab position or bookmark the current section
- Lose track when interrupted and have to re-scan the page to find their place

### 6. Handle Guide Updates

When the guide updates (new mods added, versions changed, mods removed), you have to manually diff the page to figure out what changed and whether you need to update anything.

---

## The Tool-Assisted Workflow

With the LOTD Validator, the experience transforms:

### 1. Sync & Parse the Guide — Automatically

```bash
lexy sync-guide          # download all 15 pages (cached for 24h)
lexy build-manifest      # parse 1,308 mod tasks with full metadata
```

Instead of reading raw HTML, you get a structured manifest with every mod title, file entry, FOMOD instruction, special instruction, and Nexus mod ID extracted and organized.

### 2. Validate Files Before Downloading

```bash
lexy validate            # check all files against Nexus API
```

Before you even start installing, the tool tells you:
- Which files exist and match the expected version ✅
- Which files have version differences ⚡
- Which files are archived or unavailable ❌📦
- Which need manual attention 🔧

This saves hours of discovering mid-install that a file is missing or wrong.

### 3. Work a Structured Queue

```bash
lexy next                # show exactly what to install next
lexy show <taskId>       # see files, FOMOD choices, and special instructions
```

Each task gives you:
- **File entries** with exact category, name, and version
- **FOMOD instructions** — exactly which options to pick on each page
- **Special instructions** — post-install steps, clearly listed
- **Nexus link** — direct link to the mod page
- **Validation status** — confidence this file is still available and correct

No more scanning the guide page looking for your place.

### 4. Track Progress Persistently

```bash
lexy mark-done <taskId>                    # check off completed task
lexy mark-blocked <taskId> --note "reason" # flag problematic mod
lexy export-report                         # see overall progress
```

Progress is stored in a local SQLite database. You can stop mid-session, come back days later, and `lexy next` picks up exactly where you left off.

### 5. Observe MO2 Status

```bash
lexy observe             # scan your MO2 mods/ folder
```

The observer reads your MO2 instance (read-only) and cross-references installed mods against the manifest. It shows you:
- Which guide mods are already installed
- Which are still missing
- How it matched each mod (Nexus ID, name, or fuzzy)
- Version mismatches that might need updating

### 6. Handle Updates Confidently

Re-sync and rebuild when the guide updates:

```bash
lexy sync-guide && lexy build-manifest && lexy validate
```

Then `lexy observe` against your MO2 to see what changed — new mods to install, updated versions, removed entries. No manual HTML diffing.

---

## Side-by-Side Comparison

| Scenario | Manual | Tool-Assisted |
|----------|--------|---------------|
| **Find the next mod to install** | Scroll through HTML, remember where you left off | `lexy next` — instant |
| **Download files** | Open Nexus tab, find correct file version, click download | `lexy download --next` (Premium API) |
| **Get FOMOD options** | Find the section in the guide, match to FOMOD wizard | Shown inline with the task |
| **Check if a file is available** | Visit Nexus page, browse files tab | Pre-validated with `lexy validate` |
| **Track progress** | Notepad, spreadsheet, or memory | `lexy mark-done` + SQLite persistence |
| **Resume after a break** | Re-scan the page, try to remember | `lexy next` picks up where you left off |
| **See what you've installed** | Scroll through MO2 mod list | `lexy observe` cross-references automatically |
| **Handle special instructions** | Easy to miss in wall of text | Listed explicitly per task |
| **Deal with archived mods** | Discover mid-install, search for alternatives | Flagged before you start by `lexy validate` |
| **Handle guide updates** | Manual text diffing across 15 pages | Re-sync + validate in seconds |
| **Audit your install** | Not possible retroactively | `lexy export-report` |

---

## When to Use Each Approach

### Manual is fine when:
- You're re-running a section you know well
- You're only installing a handful of mods
- You prefer reading the guide prose for learning

### Tool-assisted shines when:
- You have a Nexus Premium account and want fully automated downloading
- You're doing a full 1,300+ mod LOTD install from scratch
- You need to pick up where you left off after days or weeks
- You want to pre-validate that all files are still available before starting
- You're tracking version mismatches on an existing install
- You want confidence that you haven't missed any FOMOD steps or special instructions

---

## Summary

The LOTD Validator doesn't replace the guide — it **structures it**. The guide remains the authoritative source of what to install and why. The tool takes the guide's content and transforms it from a wall of HTML into an actionable, trackable, validated checklist.

```
Manual:     Read page → Find mod → Download → Install → Remember
Assisted:   download → install → mark-done → next
```
