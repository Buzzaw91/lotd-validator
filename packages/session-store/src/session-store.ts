import Database from "better-sqlite3";
import { createLogger } from "@lexy/logger";
import { isValidTransition, type TaskStatus } from "@lexy/core-types";

const log = createLogger("session-store");

/**
 * SQLite-backed session store for persisting install progress.
 */
export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        order_index INTEGER NOT NULL,
        mod_title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo',
        started_at TEXT,
        completed_at TEXT,
        notes TEXT DEFAULT '[]',
        confirmations TEXT DEFAULT '{}',
        matched_files TEXT DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        task_id TEXT,
        event_type TEXT NOT NULL,
        payload TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    log.info("database migrated");
  }

  // ── Session management ─────────────────────────────────────────────

  createSession(id: string, name: string): void {
    this.db.prepare("INSERT INTO sessions (id, name) VALUES (?, ?)").run(id, name);
    this.logEvent(id, null, "SESSION_CREATED", { name });
  }

  getSession(id: string) {
    return this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | { id: string; name: string; created_at: string; updated_at: string }
      | undefined;
  }

  listSessions() {
    return this.db.prepare("SELECT * FROM sessions ORDER BY created_at DESC").all() as Array<{
      id: string;
      name: string;
      created_at: string;
    }>;
  }

  // ── Task management ────────────────────────────────────────────────

  upsertTask(
    sessionId: string,
    taskId: string,
    orderIndex: number,
    modTitle: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO tasks (id, session_id, order_index, mod_title)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET order_index = ?, mod_title = ?`,
      )
      .run(taskId, sessionId, orderIndex, modTitle, orderIndex, modTitle);
  }

  getTaskStatus(taskId: string): TaskStatus | undefined {
    const row = this.db
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get(taskId) as { status: TaskStatus } | undefined;
    return row?.status;
  }

  transitionTask(sessionId: string, taskId: string, newStatus: TaskStatus): boolean {
    const current = this.getTaskStatus(taskId);
    if (!current) {
      log.warn({ taskId }, "task not found");
      return false;
    }

    if (!isValidTransition(current, newStatus)) {
      log.warn({ taskId, from: current, to: newStatus }, "invalid transition");
      return false;
    }

    const now = new Date().toISOString();
    const updates: Record<string, string | null> = { status: newStatus };

    if (newStatus === "in_progress" && current !== "in_progress") {
      updates.started_at = now;
    }
    if (newStatus === "done") {
      updates.completed_at = now;
    }

    this.db
      .prepare(
        `UPDATE tasks SET status = ?, started_at = COALESCE(?, started_at), completed_at = ?
         WHERE id = ?`,
      )
      .run(newStatus, updates.started_at ?? null, updates.completed_at ?? null, taskId);

    this.logEvent(sessionId, taskId, `TASK_${newStatus.toUpperCase()}`, {
      from: current,
      to: newStatus,
    });

    return true;
  }

  getNextTask(sessionId: string) {
    return this.db
      .prepare(
        `SELECT * FROM tasks
         WHERE session_id = ? AND status IN ('todo', 'in_progress')
         ORDER BY order_index ASC LIMIT 1`,
      )
      .get(sessionId) as { id: string; mod_title: string; order_index: number; status: string } | undefined;
  }

  getQueueSummary(sessionId: string) {
    return this.db
      .prepare(
        `SELECT status, COUNT(*) as count
         FROM tasks WHERE session_id = ?
         GROUP BY status`,
      )
      .all(sessionId) as Array<{ status: string; count: number }>;
  }

  addNote(taskId: string, note: string): void {
    const row = this.db.prepare("SELECT notes FROM tasks WHERE id = ?").get(taskId) as
      | { notes: string }
      | undefined;
    if (!row) return;

    const notes: string[] = JSON.parse(row.notes);
    notes.push(note);
    this.db.prepare("UPDATE tasks SET notes = ? WHERE id = ?").run(JSON.stringify(notes), taskId);
  }

  // ── Guide Update State Diffing ─────────────────────────────────────

  /**
   * Forcibly resets a task to 'todo' state, bypassing standard transitions.
   * Required when a guide update changes a completed task's version/files.
   */
  resetTaskToTodo(sessionId: string, taskId: string, reasonNote: string): void {
    const current = this.getTaskStatus(taskId);
    if (!current) return;

    // Reset status to todo, clear completion time, but keep start time if it existed
    this.db
      .prepare(
        `UPDATE tasks 
         SET status = 'todo', completed_at = NULL 
         WHERE id = ? AND session_id = ?`
      )
      .run(taskId, sessionId);

    this.addNote(taskId, reasonNote);

    this.logEvent(sessionId, taskId, "TASK_RESET_FOR_UPDATE", {
      from: current,
      to: "todo",
      reason: reasonNote,
    });
  }

  /**
   * Finds tasks marked 'done' in the database that are no longer present in the guide.
   */
  getOrphanedTasks(sessionId: string, currentManifestTaskIds: string[]): Array<{ id: string; modTitle: string }> {
    const allDoneTasks = this.db
      .prepare(`SELECT id, mod_title FROM tasks WHERE session_id = ? AND status = 'done'`)
      .all(sessionId) as Array<{ id: string; mod_title: string }>;

    const validIdSet = new Set(currentManifestTaskIds);

    return allDoneTasks
      .filter((row) => !validIdSet.has(row.id))
      .map((row) => ({ id: row.id, modTitle: row.mod_title }));
  }

  // ── Event logging ──────────────────────────────────────────────────

  logEvent(sessionId: string, taskId: string | null, eventType: string, payload: unknown = {}): void {
    this.db
      .prepare("INSERT INTO events (session_id, task_id, event_type, payload) VALUES (?, ?, ?, ?)")
      .run(sessionId, taskId, eventType, JSON.stringify(payload));
  }

  getEvents(sessionId: string) {
    return this.db
      .prepare("SELECT * FROM events WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as Array<{
      id: number;
      session_id: string;
      task_id: string | null;
      event_type: string;
      payload: string;
      created_at: string;
    }>;
  }

  // ── Export ──────────────────────────────────────────────────────────

  exportReport(sessionId: string) {
    const session = this.getSession(sessionId);
    const tasks = this.db
      .prepare("SELECT * FROM tasks WHERE session_id = ? ORDER BY order_index ASC")
      .all(sessionId);
    const events = this.getEvents(sessionId);
    const summary = this.getQueueSummary(sessionId);

    return { session, tasks, events, summary };
  }

  close() {
    this.db.close();
  }
}
