(function () {
  "use strict";

  const STORAGE_KEY = "html-notes-app.notes";
  const SELECTED_KEY = "html-notes-app.selected";

  const createId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "note-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  };

  const nowIso = () => new Date().toISOString();

  function createNote(title = "未命名笔记", content = "") {
    const timestamp = nowIso();
    return {
      id: createId(),
      title,
      content,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function normalizeNote(note) {
    return {
      id: typeof note.id === "string" && note.id ? note.id : createId(),
      title: typeof note.title === "string" ? note.title : "未命名笔记",
      content: typeof note.content === "string" ? note.content : "",
      createdAt: typeof note.createdAt === "string" ? note.createdAt : nowIso(),
      updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : nowIso()
    };
  }

  function sortNotes(notes) {
    return notes.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function loadNotes(storage) {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) {
        return [];
      }
      return sortNotes(parsed.map(normalizeNote));
    } catch (error) {
      return [];
    }
  }

  function saveNotes(storage, notes) {
    storage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function getPreview(content) {
    const preview = content.replace(/\s+/g, " ").trim();
    return preview || "暂无内容";
  }

  function getDisplayTitle(title) {
    return title.trim() || "未命名笔记";
  }

  function formatDate(iso) {
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

  function createStore(storage) {
    let notes = loadNotes(storage);
    let selectedId = storage.getItem(SELECTED_KEY);
    if (!notes.some((note) => note.id === selectedId)) {
      selectedId = notes[0] ? notes[0].id : "";
    }

    function persist() {
      notes = sortNotes(notes);
      saveNotes(storage, notes);
      if (selectedId) {
        storage.setItem(SELECTED_KEY, selectedId);
      } else {
        storage.removeItem(SELECTED_KEY);
      }
    }

    return {
      getNotes() {
        return notes.slice();
      },
      getSelectedId() {
        return selectedId;
      },
      getSelectedNote() {
        return notes.find((note) => note.id === selectedId) || null;
      },
      addNote() {
        const note = createNote();
        notes = [note].concat(notes);
        selectedId = note.id;
        persist();
        return note;
      },
      selectNote(id) {
        if (notes.some((note) => note.id === id)) {
          selectedId = id;
          persist();
        }
      },
      updateSelected(fields) {
        const selected = this.getSelectedNote();
        if (!selected) {
          return null;
        }
        const updated = {
          ...selected,
          ...fields,
          updatedAt: nowIso()
        };
        notes = notes.map((note) => (note.id === selected.id ? updated : note));
        selectedId = updated.id;
        persist();
        return updated;
      },
      deleteSelected() {
        const selected = this.getSelectedNote();
        if (!selected) {
          return null;
        }
        notes = notes.filter((note) => note.id !== selected.id);
        selectedId = notes[0] ? notes[0].id : "";
        persist();
        return selected;
      }
    };
  }

  function initApp(documentRef, storage) {
    const elements = {
      newNoteButton: documentRef.getElementById("newNoteButton"),
      emptyNewNoteButton: documentRef.getElementById("emptyNewNoteButton"),
      deleteNoteButton: documentRef.getElementById("deleteNoteButton"),
      searchInput: documentRef.getElementById("searchInput"),
      noteList: documentRef.getElementById("noteList"),
      noteCount: documentRef.getElementById("noteCount"),
      saveStatus: documentRef.getElementById("saveStatus"),
      titleInput: documentRef.getElementById("titleInput"),
      contentInput: documentRef.getElementById("contentInput"),
      editorFields: documentRef.getElementById("editorFields"),
      emptyState: documentRef.getElementById("emptyState")
    };

    const store = createStore(storage);
    let saveTimer = 0;

    function setSaveStatus(text) {
      elements.saveStatus.textContent = text;
    }

    function scheduleSavedStatus() {
      setSaveStatus("正在保存...");
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => setSaveStatus("已保存"), 250);
    }

    function filteredNotes() {
      const query = elements.searchInput.value.trim().toLowerCase();
      const notes = store.getNotes();
      if (!query) {
        return notes;
      }
      return notes.filter((note) => {
        return note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query);
      });
    }

    function renderList() {
      const notes = filteredNotes();
      const selectedId = store.getSelectedId();
      elements.noteList.innerHTML = "";

      notes.forEach((note) => {
        const item = documentRef.createElement("li");
        const button = documentRef.createElement("button");
        button.className = "note-item" + (note.id === selectedId ? " active" : "");
        button.type = "button";
        button.dataset.noteId = note.id;
        button.setAttribute("aria-current", note.id === selectedId ? "true" : "false");

        const title = documentRef.createElement("span");
        title.className = "note-title";
        title.textContent = getDisplayTitle(note.title);

        const preview = documentRef.createElement("span");
        preview.className = "note-preview";
        preview.textContent = getPreview(note.content);

        const date = documentRef.createElement("span");
        date.className = "note-date";
        date.textContent = formatDate(note.updatedAt);

        button.append(title, preview, date);
        item.append(button);
        elements.noteList.append(item);
      });

      elements.noteCount.textContent = store.getNotes().length + " 条笔记";
    }

    function renderEditor() {
      const selected = store.getSelectedNote();
      const hasNote = Boolean(selected);
      elements.editorFields.hidden = !hasNote;
      elements.emptyState.hidden = hasNote;
      elements.deleteNoteButton.disabled = !hasNote;

      if (!selected) {
        elements.titleInput.value = "";
        elements.contentInput.value = "";
        return;
      }

      if (documentRef.activeElement !== elements.titleInput) {
        elements.titleInput.value = selected.title;
      }
      if (documentRef.activeElement !== elements.contentInput) {
        elements.contentInput.value = selected.content;
      }
    }

    function render() {
      renderList();
      renderEditor();
    }

    function addNote() {
      store.addNote();
      elements.searchInput.value = "";
      render();
      elements.titleInput.focus();
      elements.titleInput.select();
      scheduleSavedStatus();
    }

    elements.newNoteButton.addEventListener("click", addNote);
    elements.emptyNewNoteButton.addEventListener("click", addNote);

    elements.noteList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-note-id]");
      if (!button) {
        return;
      }
      store.selectNote(button.dataset.noteId);
      render();
    });

    elements.searchInput.addEventListener("input", renderList);

    elements.titleInput.addEventListener("input", () => {
      store.updateSelected({ title: elements.titleInput.value });
      renderList();
      scheduleSavedStatus();
    });

    elements.contentInput.addEventListener("input", () => {
      store.updateSelected({ content: elements.contentInput.value });
      renderList();
      scheduleSavedStatus();
    });

    elements.deleteNoteButton.addEventListener("click", () => {
      const selected = store.getSelectedNote();
      if (!selected) {
        return;
      }
      const title = getDisplayTitle(selected.title);
      if (window.confirm("删除“" + title + "”？")) {
        store.deleteSelected();
        render();
        scheduleSavedStatus();
      }
    });

    if (store.getNotes().length === 0) {
      store.addNote();
    }

    render();
    return { store, render };
  }

  window.NotesApp = {
    STORAGE_KEY,
    SELECTED_KEY,
    createNote,
    createStore,
    getPreview,
    getDisplayTitle,
    initApp
  };

  if (!window.__notesAppTestMode) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => initApp(document, window.localStorage));
    } else {
      initApp(document, window.localStorage);
    }
  }
})();
