export const APP_NAME = "lrc神金笔记";
export const APP_SHORT_NAME = "神金笔记";
export const APP_VERSION = "2.0.0";
export const APP_LOGO_SRC = `${import.meta.env.BASE_URL}assets/logo-bird.png`;

export const LEGACY_STORAGE_KEY = "html-notes-app.notes";
export const LEGACY_SELECTED_KEY = "html-notes-app.selected";
export const LEGACY_THEME_KEY = "html-notes-app.theme";
export const LEGACY_SIDEBAR_KEY = "html-notes-app.sidebar";

export type NoteType = "text" | "handwriting";
export type ThemeMode = "light" | "dark";
export type SaveState = "saved" | "saving";

export interface Note {
  id: string;
  type: NoteType;
  folderId: string;
  title: string;
  content: string;
  handwritingPages: string[];
  pdfBackgroundPages: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  pinnedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type NewNoteInput = Pick<Note, "type">;
export type NotePatch = Partial<Pick<Note, "folderId" | "title" | "content" | "handwritingPages" | "pdfBackgroundPages">>;
export type FolderPatch = Partial<Pick<Folder, "name" | "pinnedAt">>;

export interface NotesRepository {
  listNotes(): Promise<Note[]>;
  listFolders(): Promise<Folder[]>;
  getSelectedId(): Promise<string>;
  setSelectedId(id: string): Promise<void>;
  createNote(type: NoteType): Promise<Note>;
  createFolder(name: string): Promise<Folder>;
  updateFolder(id: string, fields: FolderPatch): Promise<Folder | null>;
  deleteFolder(id: string): Promise<Folder | null>;
  updateNote(id: string, fields: NotePatch): Promise<Note | null>;
  deleteNote(id: string): Promise<Note | null>;
  migrateFromLegacyLocalStorage(): Promise<void>;
}
