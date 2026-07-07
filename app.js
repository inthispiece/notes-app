(function () {
  "use strict";

  const STORAGE_KEY = "html-notes-app.notes";
  const SELECTED_KEY = "html-notes-app.selected";
  const THEME_KEY = "html-notes-app.theme";
  const INPUT_MODE_KEY = "html-notes-app.input-mode";
  const APP_NAME = "lrc神金笔记";
  const APP_LOGO_SRC = "assets/logo-bird.png";
  const DEFAULT_INPUT_MODE = "text";
  const THEMES = {
    light: {
      value: "light",
      label: "深色",
      ariaLabel: "切换为深色模式",
      title: "切换为深色模式"
    },
    dark: {
      value: "dark",
      label: "浅色",
      ariaLabel: "切换为浅色模式",
      title: "切换为浅色模式"
    }
  };

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
      handwriting: "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function normalizeNote(note) {
    return {
      id: typeof note.id === "string" && note.id ? note.id : createId(),
      title: typeof note.title === "string" ? note.title : "未命名笔记",
      content: typeof note.content === "string" ? note.content : "",
      handwriting: typeof note.handwriting === "string" ? note.handwriting : "",
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

  function getPreview(content, handwriting = "") {
    const preview = content.replace(/\s+/g, " ").trim();
    if (preview) {
      return preview;
    }
    return handwriting ? "手写笔记" : "暂无内容";
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

  function getSystemTheme() {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  function getInitialTheme(storage) {
    const savedTheme = storage.getItem(THEME_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }
    return getSystemTheme();
  }

  function applyTheme(documentRef, theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    documentRef.documentElement.dataset.theme = nextTheme;
    return nextTheme;
  }

  function getInitialInputMode(storage) {
    const savedMode = storage.getItem(INPUT_MODE_KEY);
    return savedMode === "handwriting" ? "handwriting" : DEFAULT_INPUT_MODE;
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
      themeToggle: documentRef.getElementById("themeToggle"),
      themeToggleText: documentRef.getElementById("themeToggleText"),
      textModeButton: documentRef.getElementById("textModeButton"),
      handwritingModeButton: documentRef.getElementById("handwritingModeButton"),
      titleInput: documentRef.getElementById("titleInput"),
      contentInput: documentRef.getElementById("contentInput"),
      handwritingPanel: documentRef.getElementById("handwritingPanel"),
      handwritingCanvas: documentRef.getElementById("handwritingCanvas"),
      clearHandwritingButton: documentRef.getElementById("clearHandwritingButton"),
      editorFields: documentRef.getElementById("editorFields"),
      emptyState: documentRef.getElementById("emptyState")
    };

    const store = createStore(storage);
    let currentTheme = applyTheme(documentRef, getInitialTheme(storage));
    let currentInputMode = getInitialInputMode(storage);
    let saveTimer = 0;
    let isDrawing = false;
    let lastPoint = null;
    const handwritingContext = elements.handwritingCanvas.getContext
      ? elements.handwritingCanvas.getContext("2d")
      : null;

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
        preview.textContent = getPreview(note.content, note.handwriting);

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
        clearCanvas();
        return;
      }

      if (documentRef.activeElement !== elements.titleInput) {
        elements.titleInput.value = selected.title;
      }
      if (documentRef.activeElement !== elements.contentInput) {
        elements.contentInput.value = selected.content;
      }
      renderHandwriting(selected.handwriting);
    }

    function render() {
      renderList();
      renderEditor();
      renderInputMode();
    }

    function renderThemeToggle() {
      const theme = THEMES[currentTheme];
      elements.themeToggleText.textContent = theme.label;
      elements.themeToggle.setAttribute("aria-label", theme.ariaLabel);
      elements.themeToggle.title = theme.title;
    }

    function toggleTheme() {
      currentTheme = applyTheme(documentRef, currentTheme === "dark" ? "light" : "dark");
      storage.setItem(THEME_KEY, currentTheme);
      renderThemeToggle();
      renderHandwriting(store.getSelectedNote()?.handwriting || "");
    }

    function renderInputMode() {
      const isHandwriting = currentInputMode === "handwriting";
      elements.contentInput.hidden = isHandwriting;
      elements.handwritingPanel.hidden = !isHandwriting;
      elements.textModeButton.classList.toggle("active", !isHandwriting);
      elements.handwritingModeButton.classList.toggle("active", isHandwriting);
      elements.textModeButton.setAttribute("aria-pressed", String(!isHandwriting));
      elements.handwritingModeButton.setAttribute("aria-pressed", String(isHandwriting));
      if (isHandwriting) {
        renderHandwriting(store.getSelectedNote()?.handwriting || "");
      }
    }

    function setInputMode(mode) {
      currentInputMode = mode === "handwriting" ? "handwriting" : DEFAULT_INPUT_MODE;
      storage.setItem(INPUT_MODE_KEY, currentInputMode);
      renderInputMode();
    }

    function resizeCanvas() {
      if (!handwritingContext) {
        return;
      }
      const canvas = elements.handwritingCanvas;
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      const cssWidth = Math.max(1, Math.round(rect?.width || canvas.width || 900));
      const cssHeight = Math.max(1, Math.round(rect?.height || canvas.height || 560));
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(cssWidth * ratio) || canvas.height !== Math.round(cssHeight * ratio)) {
        canvas.width = Math.round(cssWidth * ratio);
        canvas.height = Math.round(cssHeight * ratio);
      }
      handwritingContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      handwritingContext.lineCap = "round";
      handwritingContext.lineJoin = "round";
      handwritingContext.lineWidth = 3.4;
      handwritingContext.strokeStyle = currentTheme === "dark" ? "#101828" : "#1f2933";
    }

    function clearCanvas() {
      if (!handwritingContext) {
        return;
      }
      const canvas = elements.handwritingCanvas;
      resizeCanvas();
      handwritingContext.clearRect(0, 0, canvas.width, canvas.height);
    }

    function renderHandwriting(dataUrl) {
      if (!handwritingContext) {
        return;
      }
      clearCanvas();
      if (!dataUrl) {
        return;
      }
      const image = new Image();
      image.onload = () => {
        const canvas = elements.handwritingCanvas;
        const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
        const cssWidth = Math.max(1, Math.round(rect?.width || canvas.width || 900));
        const cssHeight = Math.max(1, Math.round(rect?.height || canvas.height || 560));
        handwritingContext.drawImage(image, 0, 0, cssWidth, cssHeight);
      };
      image.src = dataUrl;
    }

    function getCanvasPoint(event) {
      const canvas = elements.handwritingCanvas;
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    function drawPoint(point) {
      handwritingContext.beginPath();
      handwritingContext.arc(point.x, point.y, 1.7, 0, Math.PI * 2);
      handwritingContext.fillStyle = handwritingContext.strokeStyle;
      handwritingContext.fill();
    }

    function saveHandwriting() {
      if (!handwritingContext) {
        return;
      }
      const dataUrl = elements.handwritingCanvas.toDataURL("image/png");
      store.updateSelected({ handwriting: dataUrl });
      renderList();
      scheduleSavedStatus();
    }

    function startDrawing(event) {
      if (!store.getSelectedNote() || !handwritingContext) {
        return;
      }
      event.preventDefault();
      resizeCanvas();
      isDrawing = true;
      lastPoint = getCanvasPoint(event);
      drawPoint(lastPoint);
      elements.handwritingCanvas.setPointerCapture?.(event.pointerId);
    }

    function draw(event) {
      if (!isDrawing || !lastPoint || !handwritingContext) {
        return;
      }
      event.preventDefault();
      const point = getCanvasPoint(event);
      handwritingContext.beginPath();
      handwritingContext.moveTo(lastPoint.x, lastPoint.y);
      handwritingContext.lineTo(point.x, point.y);
      handwritingContext.stroke();
      lastPoint = point;
    }

    function stopDrawing(event) {
      if (!isDrawing) {
        return;
      }
      event.preventDefault();
      isDrawing = false;
      lastPoint = null;
      elements.handwritingCanvas.releasePointerCapture?.(event.pointerId);
      saveHandwriting();
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
    elements.themeToggle.addEventListener("click", toggleTheme);
    elements.textModeButton.addEventListener("click", () => setInputMode("text"));
    elements.handwritingModeButton.addEventListener("click", () => setInputMode("handwriting"));
    elements.clearHandwritingButton.addEventListener("click", () => {
      clearCanvas();
      store.updateSelected({ handwriting: "" });
      renderList();
      scheduleSavedStatus();
    });
    elements.handwritingCanvas.addEventListener("pointerdown", startDrawing);
    elements.handwritingCanvas.addEventListener("pointermove", draw);
    elements.handwritingCanvas.addEventListener("pointerup", stopDrawing);
    elements.handwritingCanvas.addEventListener("pointercancel", stopDrawing);

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
    renderThemeToggle();
    return { store, render };
  }

  window.NotesApp = {
    APP_NAME,
    APP_LOGO_SRC,
    STORAGE_KEY,
    SELECTED_KEY,
    THEME_KEY,
    INPUT_MODE_KEY,
    createNote,
    createStore,
    getPreview,
    getDisplayTitle,
    getInitialTheme,
    getInitialInputMode,
    applyTheme,
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
