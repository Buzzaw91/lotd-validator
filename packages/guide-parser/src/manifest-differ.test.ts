import { describe, it, expect } from "vitest";
import { diffManifests } from "./manifest-differ";
import type { GuideManifest, InstallTask } from "@lexy/core-types";

describe("manifest-differ", () => {
  const baseTask: InstallTask = {
    id: "task-1",
    modTitle: "Test Mod 1",
    pageSlug: "page-1",
    sectionTitle: "Section 1",
    orderIndex: 1,
    fileEntries: [
      {
        fileCategory: "MAIN",
        labelText: "Main File",
        expectedVersion: "1.0",
        nexusFileId: 100,
      }
    ],
    installModeHint: "NEW",
    tags: [],
    sourceRefs: []
  };

  const oldManifest: GuideManifest = {
    generatedAt: new Date().toISOString(),
    pages: [],
    tasks: [
      { ...baseTask },
      { ...baseTask, id: "task-2", modTitle: "Test Mod 2" },
      { ...baseTask, id: "task-3", modTitle: "Test Mod 3" }
    ]
  };

  it("should detect unchanged tasks", () => {
    const newManifest: GuideManifest = {
      ...oldManifest,
      tasks: [ { ...baseTask } ]
    };

    const diff = diffManifests(
      { ...oldManifest, tasks: [ { ...baseTask } ] },
      newManifest
    );
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.unchanged[0].id).toBe("task-1");
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.updated).toHaveLength(0);
  });

  it("should detect added tasks", () => {
    const newManifest: GuideManifest = {
      ...oldManifest,
      tasks: [
        { ...baseTask },
        { ...baseTask, id: "task-add", modTitle: "New Mod" }
      ]
    };

    const diff = diffManifests(
      { ...oldManifest, tasks: [ { ...baseTask } ] },
      newManifest
    );
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].id).toBe("task-add");
    expect(diff.unchanged).toHaveLength(1);
  });

  it("should detect removed tasks", () => {
    const newManifest: GuideManifest = {
      ...oldManifest,
      tasks: [ { ...baseTask, id: "task-2", modTitle: "Test Mod 2" } ]
    };

    const diff = diffManifests(oldManifest, newManifest);
    expect(diff.removed).toHaveLength(2);
    expect(diff.removed.map(t => t.id)).toEqual(expect.arrayContaining(["task-1", "task-3"]));
    expect(diff.unchanged).toHaveLength(1);
  });

  it("should detect updated tasks (version change)", () => {
    const updatedTask = {
      ...baseTask,
      fileEntries: [
        { ...baseTask.fileEntries[0], expectedVersion: "2.0" }
      ]
    };

    const newManifest: GuideManifest = {
      ...oldManifest,
      tasks: [ updatedTask ]
    };

    const diff = diffManifests(
      { ...oldManifest, tasks: [ { ...baseTask } ] },
      newManifest
    );
    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0].oldTask.id).toBe("task-1");
    expect(diff.updated[0].changes).toContain("File entry 1 ('Main File') version changed from '1.0' to '2.0'");
  });

  it("should detect multiple change types simultaneously", () => {
    const newManifest: GuideManifest = {
      ...oldManifest,
      tasks: [
        { ...baseTask }, // unchanged
        { ...baseTask, id: "task-2", fileEntries: [{ ...baseTask.fileEntries[0], expectedVersion: "1.1" }]}, // updated
        { ...baseTask, id: "task-4" } // added
        // task-3 is removed
      ]
    };

    const diff = diffManifests(oldManifest, newManifest);
    
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.unchanged[0].id).toBe("task-1");
    
    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0].newTask.id).toBe("task-2");
    
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].id).toBe("task-3");
    
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].id).toBe("task-4");
  });
});
