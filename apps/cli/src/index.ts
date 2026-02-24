#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig, initConfig, doctorConfig, CONFIG_PATH } from "./config.js";
import { runPreinstallCheck, formatPreinstallReport } from "./doctor-preinstall.js";
import { syncGuide, buildManifest, formatDiagnostics } from "@lexy/guide-parser";
import { resolveManifest, NexusClient } from "@lexy/nexus-resolver";
import { buildQueue, renderTask } from "@lexy/install-queue-engine";
import { SessionStore } from "@lexy/session-store";
import { createSnapshot, formatSnapshot, listProfiles } from "@lexy/mo2-observer";
import { listSections, buildDownloadPlan, buildPageDownloadPlan, executeDownloads, formatDownloadResult } from "@lexy/mod-downloader";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const program = new Command();

program
  .name("lexy")
  .description("Lexy LOTD Download & Validation Assistant")
  .version("0.1.0");

// ── config init ─────────────────────────────────────────────────────

program
  .command("config-init")
  .description("Create a default config file")
  .requiredOption("--api-key <key>", "Nexus Mods API key")
  .option("--data-dir <path>", "Data directory")
  .option("--mo2-path <path>", "Path to MO2 portable instance")
  .action(async (opts) => {
    const path = await initConfig(opts.apiKey, {
      dataDir: opts.dataDir,
      mo2Path: opts.mo2Path,
    });
    console.log(`✅ Config created at ${path}`);
  });

// ── doctor ─────────────────────────────────────────────────────────

program
  .command("doctor")
  .description("Check config, DB, and cache health")
  .action(async () => {
    try {
      const config = await loadConfig();
      const issues = await doctorConfig(config);
      if (issues.length === 0) {
        console.log("✅ Everything looks good!");
      } else {
        console.log("Issues found:");
        issues.forEach((i) => console.log(`  ⚠️  ${i}`));
      }
    } catch (err) {
      console.error(`❌ ${(err as Error).message}`);
    }
  });

// ── doctor-preinstall ──────────────────────────────────────────────

program
  .command("doctor-preinstall")
  .description("Check system prerequisites, modding tools, and Skyrim folder")
  .option("--tools-dir <path>", "Path to modding tools directory")
  .option("--skyrim-path <path>", "Path to Skyrim SE installation")
  .action(async (opts) => {
    const config = await loadConfig();
    const toolsDir = opts.toolsDir ?? config.toolsDir ?? "C:\\Programs";
    const skyrimPath = opts.skyrimPath ?? config.skyrimPath;
    const mo2Path = config.mo2?.portableRoot;

    if (!skyrimPath) {
      console.log("⚠️  Skyrim path not configured. Add \"skyrimPath\" to ~/.lexy-assistant/config.json or use --skyrim-path");
    }
    if (!mo2Path) {
      console.log("⚠️  MO2 path not configured. Add \"mo2.portableRoot\" to config.json");
    }

    console.log("Checking prerequisites...");
    const report = await runPreinstallCheck({ toolsDir, skyrimPath, mo2Path });
    console.log(formatPreinstallReport(report, { toolsDir, skyrimPath, mo2Path }));
  });

// ── sync-guide ──────────────────────────────────────────────────────

program
  .command("sync-guide")
  .description("Download/update cached Lexy guide HTML pages")
  .action(async () => {
    const config = await loadConfig();
    const cacheDir = join(config.dataDir, "guide-cache");
    console.log(`Syncing guide pages to ${cacheDir}...`);

    const paths = await syncGuide({
      guideBaseUrl: config.guideBaseUrl,
      cacheDir,
    });

    console.log(`✅ ${paths.length} pages synced`);
  });

// ── build-manifest ──────────────────────────────────────────────────

program
  .command("build-manifest")
  .description("Parse cached guide pages into manifest.json")
  .action(async () => {
    const config = await loadConfig();
    const cacheDir = join(config.dataDir, "guide-cache");
    const outputPath = join(config.dataDir, "manifests", "manifest.json");

    console.log("Building manifest...");
    const { manifest, diagnostics } = await buildManifest({ cacheDir, outputPath });

    console.log(`✅ Manifest built: ${manifest.tasks.length} tasks across ${manifest.pages.length} pages`);
    
    // Filter out expected "no downloadable files" for MCM, finishing-line, etc.
    const filteredDiags = diagnostics.filter((d: any) => {
      if (d.message?.includes('has no downloadable file entries')) {
        const slug = d.pageSlug ?? d.source ?? '';
        if (['mcm-setup', 'finishing-line', 'common-task-instructions'].includes(slug)) return false;
      }
      return true;
    });
    
    if (filteredDiags.length > 0) {
      console.log("\nDiagnostics:");
      console.log(formatDiagnostics(filteredDiags));
    } else {
      console.log("\n✅ No unexpected diagnostics.");
    }
  });

// ── validate ────────────────────────────────────────────────────────

program
  .command("validate")
  .description("Validate manifest files against Nexus API")
  .action(async () => {
    const config = await loadConfig();
    const manifestPath = join(config.dataDir, "manifests", "manifest.json");
    const raw = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    console.log("Validating against Nexus...");
    
    let lastPrinted = 0;
    const records = await resolveManifest(manifest, {
      apiKey: config.nexusApiKey,
      cacheDir: join(config.dataDir, "nexus-cache"),
      onProgress: (current: number, total: number, title: string, status: string) => {
        // Print progress every 25 entries or on the last one
        if (current === total || current - lastPrinted >= 25) {
          const pct = Math.round((current / total) * 100);
          const icon = status === 'MATCH' ? '✅' : status === 'PARTIAL' ? '⚡' : status === 'MANUAL' ? '🔧' : '❌';
          console.log(`  ${icon} [${current}/${total}] ${pct}% — ${title}`);
          lastPrinted = current;
        }
      },
    });

    // Summary
    const counts = { MATCH: 0, PARTIAL: 0, MISMATCH: 0, ARCHIVED_REQUIRED: 0, MANUAL: 0 };
    for (const r of records) {
      counts[r.status]++;
    }

    console.log("\n📊 Validation Summary:");
    console.log(`  ✅ Match:    ${counts.MATCH}`);
    console.log(`  ⚡ Partial:  ${counts.PARTIAL}`);
    console.log(`  ❌ Mismatch: ${counts.MISMATCH}`);
    console.log(`  📦 Archived: ${counts.ARCHIVED_REQUIRED}`);
    console.log(`  🔧 Manual:   ${counts.MANUAL}`);

    // Write report
    const reportPath = join(config.dataDir, "validation-report.json");
    await writeFile(reportPath, JSON.stringify(records, null, 2), "utf-8");
    console.log(`\nReport saved to ${reportPath}`);
  });

// ── queue ───────────────────────────────────────────────────────────

program
  .command("queue")
  .description("Show the install queue summary")
  .action(async () => {
    const config = await loadConfig();
    const manifestPath = join(config.dataDir, "manifests", "manifest.json");
    const reportPath = join(config.dataDir, "validation-report.json");

    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    const validations = JSON.parse(await readFile(reportPath, "utf-8"));

    const queue = buildQueue(manifest.tasks, validations);
    console.log(`\n📋 Install Queue — ${queue.length} tasks\n`);

    for (let i = 0; i < queue.length; i++) {
      console.log(renderTask(queue[i]!, i));
      console.log("─".repeat(60));
    }
  });

// ── next ────────────────────────────────────────────────────────────

program
  .command("next")
  .description("Show the next task to work on")
  .option("--session <id>", "Session ID")
  .action(async (opts) => {
    const config = await loadConfig();
    const dbPath = join(config.dataDir, "sessions", "session.db");
    await mkdir(join(config.dataDir, "sessions"), { recursive: true });
    const store = new SessionStore(dbPath);

    const sessionId = opts.session ?? "default";

    // Ensure session exists
    if (!store.getSession(sessionId)) {
      store.createSession(sessionId, "Default Session");
    }

    const next = store.getNextTask(sessionId);
    if (!next) {
      console.log("🎉 All tasks complete! Nothing left to do.");
      store.close();
      return;
    }

    // Load full queue to render
    const manifestPath = join(config.dataDir, "manifests", "manifest.json");
    const reportPath = join(config.dataDir, "validation-report.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    const validations = JSON.parse(await readFile(reportPath, "utf-8"));
    const queue = buildQueue(manifest.tasks, validations);

    const task = queue.find((q) => q.taskId === next.id);
    if (task) {
      console.log("\n📌 Next Task:\n");
      console.log(renderTask(task));
    } else {
      console.log(`Next: ${next.mod_title} (${next.id})`);
    }

    store.close();
  });

// ── mark-done ───────────────────────────────────────────────────────

program
  .command("mark-done <taskId>")
  .description("Mark a task as done")
  .option("--session <id>", "Session ID", "default")
  .action(async (taskId, opts) => {
    const config = await loadConfig();
    const dbPath = join(config.dataDir, "sessions", "session.db");
    await mkdir(join(config.dataDir, "sessions"), { recursive: true });
    const store = new SessionStore(dbPath);

    // Move to in_progress first if needed
    const status = store.getTaskStatus(taskId);
    if (status === "todo") {
      store.transitionTask(opts.session, taskId, "in_progress");
    }

    const ok = store.transitionTask(opts.session, taskId, "done");
    if (ok) {
      console.log(`✅ Task ${taskId} marked done`);
    } else {
      console.log(`❌ Could not mark ${taskId} as done (current status: ${store.getTaskStatus(taskId)})`);
    }

    store.close();
  });

// ── mark-blocked ────────────────────────────────────────────────────

program
  .command("mark-blocked <taskId>")
  .description("Mark a task as blocked")
  .option("--session <id>", "Session ID", "default")
  .option("--note <text>", "Reason for blocking")
  .action(async (taskId, opts) => {
    const config = await loadConfig();
    const dbPath = join(config.dataDir, "sessions", "session.db");
    await mkdir(join(config.dataDir, "sessions"), { recursive: true });
    const store = new SessionStore(dbPath);

    // Must be in_progress to block
    const status = store.getTaskStatus(taskId);
    if (status === "todo") {
      store.transitionTask(opts.session, taskId, "in_progress");
    }

    const ok = store.transitionTask(opts.session, taskId, "blocked");
    if (ok) {
      if (opts.note) store.addNote(taskId, opts.note);
      console.log(`🚧 Task ${taskId} marked blocked`);
    } else {
      console.log(`❌ Could not block ${taskId} (current status: ${store.getTaskStatus(taskId)})`);
    }

    store.close();
  });

// ── export-report ───────────────────────────────────────────────────

program
  .command("export-report")
  .description("Export audit report for a session")
  .option("--session <id>", "Session ID", "default")
  .action(async (opts) => {
    const config = await loadConfig();
    const dbPath = join(config.dataDir, "sessions", "session.db");
    const store = new SessionStore(dbPath);

    const report = store.exportReport(opts.session);
    const outputPath = join(config.dataDir, "audit-report.json");
    await writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");

    console.log(`📊 Report exported to ${outputPath}`);
    console.log("\nSummary:");
    for (const s of report.summary) {
      console.log(`  ${s.status}: ${s.count}`);
    }

    store.close();
  });

// ── show ────────────────────────────────────────────────────────────

program
  .command("show <taskId>")
  .description("Show details for a specific task")
  .action(async (taskId) => {
    const config = await loadConfig();
    const manifestPath = join(config.dataDir, "manifests", "manifest.json");
    const reportPath = join(config.dataDir, "validation-report.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    const validations = JSON.parse(await readFile(reportPath, "utf-8"));

    const queue = buildQueue(manifest.tasks, validations);
    const task = queue.find((q) => q.taskId === taskId);

    if (!task) {
      console.log(`❌ Task "${taskId}" not found`);
      return;
    }

    console.log("\n" + renderTask(task));
  });

// ── observe ─────────────────────────────────────────────────────────

program
  .command("observe")
  .description("Read MO2 state and compare against the guide manifest")
  .option("--mo2-path <path>", "Path to MO2 portable instance")
  .option("--profile <name>", "MO2 profile name", "Default")
  .option("--json", "Output raw JSON instead of formatted text")
  .action(async (opts) => {
    const config = await loadConfig();

    const mo2Path = opts.mo2Path ?? config.mo2?.portableRoot;
    if (!mo2Path) {
      console.error(
        "❌ MO2 path not configured. Use --mo2-path or set mo2.portableRoot in config.json",
      );
      process.exit(1);
    }

    // Check that profile exists
    const profiles = await listProfiles(mo2Path);
    if (profiles.length === 0) {
      console.error(`❌ No profiles found in ${mo2Path}/profiles/`);
      process.exit(1);
    }
    if (!profiles.includes(opts.profile)) {
      console.error(`❌ Profile "${opts.profile}" not found. Available: ${profiles.join(", ")}`);
      process.exit(1);
    }

    // Load manifest
    const manifestPath = join(config.dataDir, "manifests", "manifest.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    } catch {
      console.error("❌ Manifest not found. Run `lexy build-manifest` first.");
      process.exit(1);
    }

    console.log("Scanning MO2 instance...");
    const snapshot = await createSnapshot(mo2Path, opts.profile, manifest);

    if (opts.json) {
      console.log(JSON.stringify(snapshot, null, 2));
    } else {
      console.log(formatSnapshot(snapshot));
    }

    // Optionally save snapshot
    const snapshotPath = join(config.dataDir, "mo2-snapshot.json");
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(snapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");
    console.log(`\n💾 Snapshot saved to ${snapshotPath}`);
  });

// ── download ────────────────────────────────────────────────────────

program
  .command("download")
  .description("Download mod files from Nexus via premium API")
  .option("--next", "Download the section containing the next pending task")
  .option("--section <name>", "Download files for a specific section")
  .option("--page <slug>", "Download all sections in a page")
  .option("--list", "List available sections")
  .option("--skip-existing", "Skip files already in MO2 downloads dir")
  .option("--dry-run", "Show what would be downloaded without downloading")
  .option("--mo2-path <path>", "Path to MO2 portable instance")
  .option("--session <id>", "Session ID (for --next)")
  .action(async (opts) => {
    const config = await loadConfig();

    const manifestPath = join(config.dataDir, "manifests", "manifest.json");
    const reportPath = join(config.dataDir, "validation-report.json");

    let manifest, validations;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    } catch {
      console.error("❌ Manifest not found. Run `lexy build-manifest` first.");
      process.exit(1);
    }

    if (opts.list) {
      const sections = listSections(manifest);
      console.log(`\n📋 Available Sections (${sections.length} total)\n`);
      for (const s of sections) {
        console.log(`  ${s.pageSlug} > ${s.sectionTitle} (${s.fileCount} files in ${s.taskCount} tasks)`);
      }
      return;
    }

    try {
      validations = JSON.parse(await readFile(reportPath, "utf-8"));
    } catch {
      console.error("❌ Validation report not found. Run `lexy validate` first.");
      process.exit(1);
    }

    let plan;

    if (opts.next) {
      const sessionId = opts.session ?? "default";
      const dbPath = join(config.dataDir, "sessions", "session.db");
      await mkdir(join(config.dataDir, "sessions"), { recursive: true });
      const store = new SessionStore(dbPath);

      if (!store.getSession(sessionId)) {
        store.createSession(sessionId, "Default Session");
      }

      const next = store.getNextTask(sessionId);
      store.close();

      if (!next) {
        console.log("🎉 All tasks complete! Nothing left to download.");
        return;
      }

      const task = manifest.tasks.find((t: any) => t.id === next.id);
      if (!task) {
        console.error(`❌ Could not find task ${next.id} in manifest.`);
        process.exit(1);
      }

      console.log(`\n📌 Next pending task is in: ${task.pageSlug} > ${task.sectionTitle}`);
      plan = buildDownloadPlan(manifest, validations, task.sectionTitle, task.pageSlug);
    } else if (opts.section) {
      plan = buildDownloadPlan(manifest, validations, opts.section);
    } else if (opts.page) {
      plan = buildPageDownloadPlan(manifest, validations, opts.page);
    } else {
      console.error("❌ Must specify --next, --section, --page, or --list");
      process.exit(1);
    }

    if (plan.targets.length === 0) {
      console.log("No downloadable files found for this selection.");
      return;
    }

    const mo2Path = opts.mo2Path ?? config.mo2?.portableRoot;
    if (!mo2Path) {
      console.error("❌ MO2 path not configured. Required to locate downloads folder.");
      process.exit(1);
    }

    const downloadsDir = join(mo2Path, "downloads");

    if (opts.dryRun) {
      console.log(`\n🔍 Dry Run: ${plan.sectionTitle}`);
      console.log(`Will download ${plan.targets.length} files to ${downloadsDir}\n`);
      for (const t of plan.targets) {
        console.log(`  • ${t.modTitle} — ${t.expectedFileName ?? t.matchedFileName ?? "Unknown"}`);
      }
      if (plan.skippedManual > 0) console.log(`\n  (Skipping ${plan.skippedManual} files with no Nexus ID)`);
      if (plan.skippedNoFileId > 0) console.log(`  (Skipping ${plan.skippedNoFileId} files failing validation)`);
      return;
    }

    const client = new NexusClient({ apiKey: config.nexusApiKey });
    const { default: ora } = await import("ora");
    const spinner = ora("Downloading files...").start();

    const result = await executeDownloads(plan, {
      downloadsDir,
      client,
      skipExisting: !!opts.skipExisting,
      onProgress: (event) => {
        spinner.text = `[${event.current}/${event.total}] ${event.target.modTitle} (${event.status})`;
      },
    });

    spinner.stop();
    console.log(formatDownloadResult(result, plan));
  });

program.parse();
