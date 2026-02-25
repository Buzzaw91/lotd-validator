import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionStore } from "./session-store";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync } from "node:fs";

describe("SessionStore Update Methods", () => {
  let store: SessionStore;
  let dbPath: string;
  const sessionId = "test-session";

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-session-${Date.now()}.sqlite`);
    store = new SessionStore(dbPath);
    store.createSession(sessionId, "Test Session");
  });

  afterEach(() => {
    store.close();
    try {
      unlinkSync(dbPath);
      unlinkSync(`${dbPath}-wal`);
      unlinkSync(`${dbPath}-shm`);
    } catch {}
  });

  describe("resetTaskToTodo", () => {
    it("should forcibly reset a done task to todo and add a note", () => {
      // Setup a done task
      store.upsertTask(sessionId, "task-1", 1, "Mod A");
      store.transitionTask(sessionId, "task-1", "in_progress");
      store.transitionTask(sessionId, "task-1", "done");

      expect(store.getTaskStatus("task-1")).toBe("done");

      // Reset it
      store.resetTaskToTodo(sessionId, "task-1", "[UPDATE] Version changed");

      expect(store.getTaskStatus("task-1")).toBe("todo");

      // Check the note
      const dbStore = (store as any).db;
      const row = dbStore.prepare("SELECT notes, completed_at FROM tasks WHERE id = ?").get("task-1");
      
      expect(row.completed_at).toBeNull();
      const notes = JSON.parse(row.notes);
      expect(notes).toContain("[UPDATE] Version changed");
    });

    it("should do nothing if task doesn't exist", () => {
      store.resetTaskToTodo(sessionId, "non-existent", "test");
      expect(store.getTaskStatus("non-existent")).toBeUndefined();
    });
  });

  describe("getOrphanedTasks", () => {
    it("should return tasks marked done that are NOT in the active manifest list", () => {
      store.upsertTask(sessionId, "task-1", 1, "Mod A");
      store.upsertTask(sessionId, "task-2", 2, "Mod B");
      store.upsertTask(sessionId, "task-3", 3, "Mod C");

      store.transitionTask(sessionId, "task-1", "in_progress");
      store.transitionTask(sessionId, "task-1", "done");

      store.transitionTask(sessionId, "task-2", "in_progress");
      store.transitionTask(sessionId, "task-2", "done");

      // task-3 remains todo

      // The new manifest only knows about task-2 and task-4
      const newManifestTaskIds = ["task-2", "task-4"];

      const orphans = store.getOrphanedTasks(sessionId, newManifestTaskIds);

      // task-1 is done but missing from new manifest -> orphan
      // task-2 is done and present in new manifest -> not orphan
      // task-3 is missing but NOT done -> not orphan
      
      expect(orphans).toHaveLength(1);
      expect(orphans[0].id).toBe("task-1");
      expect(orphans[0].modTitle).toBe("Mod A");
    });
  });
});
