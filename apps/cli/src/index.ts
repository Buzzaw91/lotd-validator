#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig, initConfig, doctorConfig, CONFIG_PATH } from "./config.js";
import { syncGuide, buildManifest, formatDiagnostics } from "@lexy/guide-parser";
import { resolveManifest } from "@lexy/nexus-resolver";
import { buildQueue, renderTask } from "@lexy/install-queue-engine";
import { SessionStore } from "@lexy/session-store";
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
  .action(async (opts) => {
    const path = await initConfig(opts.apiKey, opts.dataDir);
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
    if (diagnostics.length > 0) {
      console.log("\nDiagnostics:");
      console.log(formatDiagnostics(diagnostics));
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
    const records = await resolveManifest(manifest, {
      apiKey: config.nexusApiKey,
      cacheDir: join(config.dataDir, "nexus-cache"),
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

program.parse();
