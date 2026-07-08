import type { Note, NoteType } from "./types";

export const NOTE_TYPES = {
  text: "text",
  handwriting: "handwriting"
} as const;

export function nowIso() {
  return new Date().toISOString();
}

export function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createNote(type: NoteType = "text", title = "未命名笔记", content = ""): Note {
  const timestamp = nowIso();
  const noteType = type === "handwriting" ? "handwriting" : "text";
  return {
    id: createId(),
    type: noteType,
    folderId: "",
    title: title.trim() ? title : "未命名笔记",
    content: noteType === "text" ? content : "",
    handwritingPages: [""],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function normalizeNote(value: unknown): Note {
  const source = (value && typeof value === "object" ? value : {}) as Partial<Note> & {
    handwriting?: unknown;
  };
  const pages = Array.isArray(source.handwritingPages)
    ? source.handwritingPages.filter((page): page is string => typeof page === "string")
    : [];
  if (pages.length === 0 && typeof source.handwriting === "string" && source.handwriting) {
    pages.push(source.handwriting);
  }
  if (pages.length === 0) {
    pages.push("");
  }

  const type: NoteType =
    source.type === "handwriting" || (!source.type && pages.some(Boolean)) ? "handwriting" : "text";

  return {
    id: typeof source.id === "string" && source.id ? source.id : createId(),
    type,
    folderId: typeof source.folderId === "string" ? source.folderId : "",
    title: typeof source.title === "string" ? source.title : "未命名笔记",
    content: type === "text" && typeof source.content === "string" ? source.content : "",
    handwritingPages: pages,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : nowIso(),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : nowIso()
  };
}

export function sortNotes(notes: Note[]) {
  return notes.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getDisplayTitle(title: string) {
  return title.trim() || "未命名笔记";
}

export function hasHandwritingPages(handwritingPages: string[]) {
  return handwritingPages.some((page) => page.trim().length > 0);
}

export function getPreview(note: Pick<Note, "content" | "handwritingPages" | "type">) {
  const preview = note.content.replace(/\s+/g, " ").trim();
  if (preview) {
    return preview;
  }
  if (note.type === "handwriting" || hasHandwritingPages(note.handwritingPages)) {
    return "手写笔记";
  }
  return "暂无内容";
}

export function formatNoteDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function firstHandwritingPage(pages: string[]) {
  return pages.find(Boolean) || "";
}
