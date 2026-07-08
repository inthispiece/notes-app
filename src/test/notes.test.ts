import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { createNote, getDisplayTitle, getPreview, normalizeNote } from "../lib/notes";
import { IndexedDbNotesRepository } from "../lib/repository";
import { LEGACY_SELECTED_KEY, LEGACY_STORAGE_KEY } from "../lib/types";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] || null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    }
  };
}

describe("note model", () => {
  it("creates text and handwriting notes with stable defaults", () => {
    const text = createNote("text");
    const handwriting = createNote("handwriting");

    expect(text.type).toBe("text");
    expect(text.content).toBe("");
    expect(text.handwritingPages).toEqual([""]);
    expect(handwriting.type).toBe("handwriting");
    expect(handwriting.content).toBe("");
  });

  it("uses friendly empty title and preview labels", () => {
    expect(getDisplayTitle("   ")).toBe("未命名笔记");
    expect(getPreview({ type: "text", content: "\n\t", handwritingPages: [""] })).toBe("暂无内容");
    expect(getPreview({ type: "handwriting", content: "", handwritingPages: ["data:image/png;base64,abc"] })).toBe("手写笔记");
  });

  it("normalizes legacy handwriting data into pages", () => {
    const note = normalizeNote({
      id: "old",
      title: "旧手写",
      content: "",
      handwriting: "data:image/png;base64,abc",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(note.type).toBe("handwriting");
    expect(note.handwritingPages).toEqual(["data:image/png;base64,abc"]);
  });
});

describe("IndexedDbNotesRepository", () => {
  it("creates, selects, updates and deletes notes", async () => {
    const repository = new IndexedDbNotesRepository(createMemoryStorage(), "notes-repository-crud-test");
    const first = await repository.createNote("text");
    const second = await repository.createNote("handwriting");

    expect(await repository.getSelectedId()).toBe(second.id);
    await repository.setSelectedId(first.id);
    expect(await repository.getSelectedId()).toBe(first.id);

    const updated = await repository.updateNote(first.id, { title: "会议记录", content: "确认发布时间" });
    expect(updated?.title).toBe("会议记录");
    expect(updated?.content).toBe("确认发布时间");

    await repository.deleteNote(first.id);
    expect(await repository.getSelectedId()).toBe(second.id);
    expect(await repository.listNotes()).toHaveLength(1);
  });

  it("creates folders and assigns notes to them", async () => {
    const repository = new IndexedDbNotesRepository(createMemoryStorage(), "notes-repository-folder-test");
    const note = await repository.createNote("handwriting");
    const folder = await repository.createFolder("PDF 资料");

    const updated = await repository.updateNote(note.id, { folderId: folder.id });

    expect((await repository.listFolders()).map((item) => item.name)).toEqual(["PDF 资料"]);
    expect(updated?.folderId).toBe(folder.id);
    expect((await repository.listNotes())[0].folderId).toBe(folder.id);
  });

  it("renames, pins and deletes folders without deleting notes", async () => {
    const repository = new IndexedDbNotesRepository(createMemoryStorage(), "notes-repository-folder-actions-test");
    const note = await repository.createNote("text");
    const first = await repository.createFolder("普通");
    const second = await repository.createFolder("重要");
    await repository.updateNote(note.id, { folderId: second.id });

    await repository.updateFolder(first.id, { name: "资料" });
    await repository.updateFolder(second.id, { pinnedAt: "2026-01-02T00:00:00.000Z" });

    const folders = await repository.listFolders();
    expect(folders[0].id).toBe(second.id);
    expect(folders[1].name).toBe("资料");

    await repository.deleteFolder(second.id);
    expect(await repository.listFolders()).toHaveLength(1);
    expect((await repository.listNotes())[0].folderId).toBe("");
  });

  it("migrates legacy localStorage notes without deleting old data", async () => {
    const storage = createMemoryStorage();
    storage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify([
        {
          id: "legacy",
          title: "旧笔记",
          content: "旧内容",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ])
    );
    storage.setItem(LEGACY_SELECTED_KEY, "legacy");

    const repository = new IndexedDbNotesRepository(storage, "notes-repository-migration-test");
    await repository.migrateFromLegacyLocalStorage();

    const notes = await repository.listNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("旧笔记");
    expect(await repository.getSelectedId()).toBe("legacy");
    expect(storage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });
});
