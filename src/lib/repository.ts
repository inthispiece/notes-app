import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { createNote, normalizeNote, sortNotes } from "./notes";
import {
  LEGACY_SELECTED_KEY,
  LEGACY_STORAGE_KEY,
  type Note,
  type NotePatch,
  type NoteType,
  type NotesRepository
} from "./types";

const DB_NAME = "lrc-shenjin-notes";
const DB_VERSION = 1;
const NOTES_STORE = "notes";
const META_STORE = "meta";
const SELECTED_ID = "selectedId";
const LEGACY_MIGRATED = "legacyMigrated";

interface NotesDb extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { "by-updated": string };
  };
  meta: {
    key: string;
    value: string;
  };
}

export class IndexedDbNotesRepository implements NotesRepository {
  private dbPromise: Promise<IDBPDatabase<NotesDb>>;
  private storage: Storage | null;

  constructor(storage: Storage | null = typeof window !== "undefined" ? window.localStorage : null, dbName = DB_NAME) {
    this.storage = storage;
    this.dbPromise = openDB<NotesDb>(dbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(NOTES_STORE)) {
          const store = db.createObjectStore(NOTES_STORE, { keyPath: "id" });
          store.createIndex("by-updated", "updatedAt");
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
      }
    });
  }

  async listNotes() {
    const db = await this.dbPromise;
    return sortNotes(await db.getAll(NOTES_STORE));
  }

  async getSelectedId() {
    const db = await this.dbPromise;
    return (await db.get(META_STORE, SELECTED_ID)) || "";
  }

  async setSelectedId(id: string) {
    const db = await this.dbPromise;
    if (id) {
      await db.put(META_STORE, id, SELECTED_ID);
    } else {
      await db.delete(META_STORE, SELECTED_ID);
    }
  }

  async createNote(type: NoteType) {
    const db = await this.dbPromise;
    const note = createNote(type);
    const tx = db.transaction([NOTES_STORE, META_STORE], "readwrite");
    await tx.objectStore(NOTES_STORE).put(note);
    await tx.objectStore(META_STORE).put(note.id, SELECTED_ID);
    await tx.done;
    return note;
  }

  async updateNote(id: string, fields: NotePatch) {
    const db = await this.dbPromise;
    const current = await db.get(NOTES_STORE, id);
    if (!current) {
      return null;
    }
    const updated: Note = {
      ...current,
      ...fields,
      updatedAt: new Date().toISOString()
    };
    await db.put(NOTES_STORE, updated);
    return updated;
  }

  async deleteNote(id: string) {
    const db = await this.dbPromise;
    const current = await db.get(NOTES_STORE, id);
    if (!current) {
      return null;
    }
    const tx = db.transaction([NOTES_STORE, META_STORE], "readwrite");
    await tx.objectStore(NOTES_STORE).delete(id);
    const remaining = sortNotes(await tx.objectStore(NOTES_STORE).getAll());
    if (remaining[0]) {
      await tx.objectStore(META_STORE).put(remaining[0].id, SELECTED_ID);
    } else {
      await tx.objectStore(META_STORE).delete(SELECTED_ID);
    }
    await tx.done;
    return current;
  }

  async migrateFromLegacyLocalStorage() {
    const db = await this.dbPromise;
    const alreadyMigrated = await db.get(META_STORE, LEGACY_MIGRATED);
    if (alreadyMigrated === "true" || !this.storage) {
      return;
    }

    const raw = this.storage.getItem(LEGACY_STORAGE_KEY);
    const selected = this.storage.getItem(LEGACY_SELECTED_KEY) || "";
    if (!raw) {
      await db.put(META_STORE, "true", LEGACY_MIGRATED);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        await db.put(META_STORE, "true", LEGACY_MIGRATED);
        return;
      }
      const existing = await db.getAllKeys(NOTES_STORE);
      const tx = db.transaction([NOTES_STORE, META_STORE], "readwrite");
      if (existing.length === 0) {
        const notes = sortNotes(parsed.map(normalizeNote));
        for (const note of notes) {
          await tx.objectStore(NOTES_STORE).put(note);
        }
        const selectedExists = notes.some((note) => note.id === selected);
        const nextSelected = selectedExists ? selected : notes[0]?.id || "";
        if (nextSelected) {
          await tx.objectStore(META_STORE).put(nextSelected, SELECTED_ID);
        }
      }
      await tx.objectStore(META_STORE).put("true", LEGACY_MIGRATED);
      await tx.done;
    } catch {
      await db.put(META_STORE, "true", LEGACY_MIGRATED);
    }
  }
}
