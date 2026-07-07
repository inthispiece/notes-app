(function () {
  "use strict";

  const STORAGE_KEY = "html-notes-app.notes";
  const SELECTED_KEY = "html-notes-app.selected";
  const THEME_KEY = "html-notes-app.theme";
  const APP_NAME = "lrc神金笔记";
  const APP_LOGO_SRC = "assets/logo-bird.png";
  const NOTE_TYPES = {
    text: "text",
    handwriting: "handwriting"
  };
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

  function createNote(type = NOTE_TYPES.text, title = "未命名笔记", content = "") {
    const timestamp = nowIso();
    const isExplicitType = type === NOTE_TYPES.text || type === NOTE_TYPES.handwriting;
    const noteType = type === NOTE_TYPES.handwriting ? NOTE_TYPES.handwriting : NOTE_TYPES.text;
    const noteTitle = isExplicitType ? title : type;
    const noteContent = isExplicitType ? content : title;
    return {
      id: createId(),
      type: noteType,
      title: typeof noteTitle === "string" && noteTitle ? noteTitle : "未命名笔记",
      content: noteType === NOTE_TYPES.text && typeof noteContent === "string" ? noteContent : "",
      handwriting: "",
      handwritingPages: [""],
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function normalizeNote(note) {
    const handwritingPages = Array.isArray(note.handwritingPages)
      ? note.handwritingPages.filter((page) => typeof page === "string")
      : [];
    if (handwritingPages.length === 0 && typeof note.handwriting === "string" && note.handwriting) {
      handwritingPages.push(note.handwriting);
    }
    if (handwritingPages.length === 0) {
      handwritingPages.push("");
    }
    const noteType =
      note.type === NOTE_TYPES.handwriting || (!note.type && handwritingPages.some(Boolean))
        ? NOTE_TYPES.handwriting
        : NOTE_TYPES.text;
    return {
      id: typeof note.id === "string" && note.id ? note.id : createId(),
      type: noteType,
      title: typeof note.title === "string" ? note.title : "未命名笔记",
      content: noteType === NOTE_TYPES.text && typeof note.content === "string" ? note.content : "",
      handwriting: handwritingPages.find(Boolean) || "",
      handwritingPages,
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

  function hasHandwritingPages(handwritingPages) {
    return Array.isArray(handwritingPages) && handwritingPages.some((page) => typeof page === "string" && page);
  }

  function getPreview(content, handwritingPages = []) {
    const preview = content.replace(/\s+/g, " ").trim();
    if (preview) {
      return preview;
    }
    return hasHandwritingPages(handwritingPages) ? "手写笔记" : "暂无内容";
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
      addNote(type = NOTE_TYPES.text) {
        const note = createNote(type);
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
      titleInput: documentRef.getElementById("titleInput"),
      contentInput: documentRef.getElementById("contentInput"),
      handwritingPanel: documentRef.getElementById("handwritingPanel"),
      handwritingCanvas: documentRef.getElementById("handwritingCanvas"),
      clearHandwritingButton: documentRef.getElementById("clearHandwritingButton"),
      prevPageButton: documentRef.getElementById("prevPageButton"),
      nextPageButton: documentRef.getElementById("nextPageButton"),
      addPageButton: documentRef.getElementById("addPageButton"),
      pageIndicatorButton: documentRef.getElementById("pageIndicatorButton"),
      penColorInput: documentRef.getElementById("penColorInput"),
      penSizeInput: documentRef.getElementById("penSizeInput"),
      eraserButton: documentRef.getElementById("eraserButton"),
      handwritingControls: Array.from(documentRef.querySelectorAll(".handwriting-control")),
      editorFields: documentRef.getElementById("editorFields"),
      emptyState: documentRef.getElementById("emptyState"),
      noteTypeDialog: documentRef.getElementById("noteTypeDialog"),
      noteTypeButtons: Array.from(documentRef.querySelectorAll("[data-note-type]")),
      cancelNoteTypeButton: documentRef.getElementById("cancelNoteTypeButton"),
      deleteConfirmDialog: documentRef.getElementById("deleteConfirmDialog"),
      deleteConfirmText: documentRef.getElementById("deleteConfirmText"),
      confirmDeleteButton: documentRef.getElementById("confirmDeleteButton"),
      cancelDeleteButton: documentRef.getElementById("cancelDeleteButton")
    };

    const store = createStore(storage);
    let currentTheme = applyTheme(documentRef, getInitialTheme(storage));
    let currentPageIndex = 0;
    let saveTimer = 0;
    let isDrawing = false;
    let lastPoint = null;
    let isEraser = false;
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
        const typeLabel = note.type === NOTE_TYPES.handwriting ? "手写笔记" : "文本笔记";
        return (
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query) ||
          typeLabel.includes(query)
        );
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
        preview.textContent = getPreview(note.content, note.handwritingPages);

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
      const isHandwriting = selected?.type === NOTE_TYPES.handwriting;
      elements.contentInput.hidden = !hasNote || isHandwriting;
      elements.handwritingPanel.hidden = !hasNote || !isHandwriting;
      elements.handwritingControls.forEach((control) => {
        control.hidden = !hasNote || !isHandwriting;
      });

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
      if (isHandwriting) {
        const pages = getHandwritingPages(selected);
        currentPageIndex = Math.min(currentPageIndex, pages.length - 1);
        renderHandwriting(pages[currentPageIndex]);
        renderPageControls(pages);
      }
    }

    function render() {
      renderList();
      renderEditor();
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
      const selected = store.getSelectedNote();
      if (selected?.type === NOTE_TYPES.handwriting) {
        renderHandwriting(getHandwritingPages(selected)[currentPageIndex] || "");
      }
    }

    function getHandwritingPages(note) {
      if (!note || note.type !== NOTE_TYPES.handwriting) {
        return [""];
      }
      const pages = Array.isArray(note.handwritingPages) ? note.handwritingPages.slice() : [];
      return pages.length ? pages : [""];
    }

    function getFirstHandwritingPage(pages) {
      return pages.find(Boolean) || "";
    }

    function renderPageControls(pages) {
      elements.pageIndicatorButton.textContent = currentPageIndex + 1 + " / " + pages.length;
      elements.pageIndicatorButton.title = "跳转页码";
      elements.prevPageButton.disabled = currentPageIndex === 0;
      elements.nextPageButton.disabled = currentPageIndex >= pages.length - 1;
    }

    function getPenSize() {
      const size = Number(elements.penSizeInput.value);
      return Number.isFinite(size) ? Math.max(1, Math.min(18, size)) : 4;
    }

    function applyDrawingStyle() {
      if (!handwritingContext) {
        return;
      }
      handwritingContext.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
      handwritingContext.lineCap = "round";
      handwritingContext.lineJoin = "round";
      handwritingContext.lineWidth = isEraser ? getPenSize() * 2.2 : getPenSize();
      handwritingContext.strokeStyle = isEraser ? "rgba(0, 0, 0, 1)" : elements.penColorInput.value;
      handwritingContext.fillStyle = handwritingContext.strokeStyle;
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
      applyDrawingStyle();
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
        const previousOperation = handwritingContext.globalCompositeOperation;
        handwritingContext.globalCompositeOperation = "source-over";
        handwritingContext.drawImage(image, 0, 0, cssWidth, cssHeight);
        handwritingContext.globalCompositeOperation = previousOperation;
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
      handwritingContext.arc(point.x, point.y, handwritingContext.lineWidth / 2, 0, Math.PI * 2);
      handwritingContext.fill();
    }

    function saveHandwriting() {
      if (!handwritingContext) {
        return;
      }
      const selected = store.getSelectedNote();
      if (!selected || selected.type !== NOTE_TYPES.handwriting) {
        return;
      }
      const dataUrl = elements.handwritingCanvas.toDataURL("image/png");
      const pages = getHandwritingPages(selected);
      pages[currentPageIndex] = dataUrl;
      store.updateSelected({
        handwriting: getFirstHandwritingPage(pages),
        handwritingPages: pages
      });
      renderList();
      renderPageControls(pages);
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

    function showNoteTypeDialog() {
      elements.noteTypeDialog.hidden = false;
      elements.noteTypeButtons[0]?.focus();
    }

    function hideNoteTypeDialog() {
      elements.noteTypeDialog.hidden = true;
    }

    function addNote(type) {
      store.addNote(type);
      currentPageIndex = 0;
      elements.searchInput.value = "";
      hideNoteTypeDialog();
      render();
      elements.titleInput.focus();
      elements.titleInput.select();
      scheduleSavedStatus();
    }

    function updateCurrentPage(pageIndex) {
      const selected = store.getSelectedNote();
      if (!selected || selected.type !== NOTE_TYPES.handwriting) {
        return;
      }
      const pages = getHandwritingPages(selected);
      currentPageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
      renderHandwriting(pages[currentPageIndex]);
      renderPageControls(pages);
    }

    function jumpToPage() {
      const selected = store.getSelectedNote();
      if (!selected || selected.type !== NOTE_TYPES.handwriting) {
        return;
      }
      const pages = getHandwritingPages(selected);
      const answer = window.prompt("跳转到页码（1-" + pages.length + "）", String(currentPageIndex + 1));
      if (answer === null) {
        return;
      }
      const pageNumber = Number.parseInt(answer, 10);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pages.length) {
        return;
      }
      updateCurrentPage(pageNumber - 1);
    }

    function addHandwritingPage() {
      const selected = store.getSelectedNote();
      if (!selected || selected.type !== NOTE_TYPES.handwriting) {
        return;
      }
      const pages = getHandwritingPages(selected);
      pages.push("");
      currentPageIndex = pages.length - 1;
      store.updateSelected({
        handwriting: getFirstHandwritingPage(pages),
        handwritingPages: pages
      });
      render();
      scheduleSavedStatus();
    }

    function renderEraserState() {
      elements.eraserButton.classList.toggle("active", isEraser);
      elements.eraserButton.setAttribute("aria-pressed", String(isEraser));
      elements.handwritingCanvas.style.cursor = isEraser ? "cell" : "crosshair";
      applyDrawingStyle();
    }

    function showDeleteDialog() {
      const selected = store.getSelectedNote();
      if (!selected) {
        return;
      }
      elements.deleteConfirmText.textContent = "确定删除“" + getDisplayTitle(selected.title) + "”吗？";
      elements.deleteConfirmDialog.hidden = false;
      elements.confirmDeleteButton.focus();
    }

    function hideDeleteDialog() {
      elements.deleteConfirmDialog.hidden = true;
    }

    function deleteSelectedNote() {
      if (!store.getSelectedNote()) {
        return;
      }
      hideDeleteDialog();
      store.deleteSelected();
      currentPageIndex = 0;
      render();
      scheduleSavedStatus();
    }

    elements.newNoteButton.addEventListener("click", showNoteTypeDialog);
    elements.emptyNewNoteButton.addEventListener("click", showNoteTypeDialog);
    elements.cancelNoteTypeButton.addEventListener("click", hideNoteTypeDialog);
    elements.noteTypeButtons.forEach((button) => {
      button.addEventListener("click", () => addNote(button.dataset.noteType));
    });
    elements.themeToggle.addEventListener("click", toggleTheme);
    elements.clearHandwritingButton.addEventListener("click", () => {
      const selected = store.getSelectedNote();
      if (!selected || selected.type !== NOTE_TYPES.handwriting) {
        return;
      }
      const pages = getHandwritingPages(selected);
      pages[currentPageIndex] = "";
      clearCanvas();
      store.updateSelected({
        handwriting: getFirstHandwritingPage(pages),
        handwritingPages: pages
      });
      renderList();
      renderPageControls(pages);
      scheduleSavedStatus();
    });
    elements.prevPageButton.addEventListener("click", () => updateCurrentPage(currentPageIndex - 1));
    elements.nextPageButton.addEventListener("click", () => updateCurrentPage(currentPageIndex + 1));
    elements.addPageButton.addEventListener("click", addHandwritingPage);
    elements.pageIndicatorButton.addEventListener("click", jumpToPage);
    elements.penColorInput.addEventListener("input", applyDrawingStyle);
    elements.penSizeInput.addEventListener("input", applyDrawingStyle);
    elements.eraserButton.addEventListener("click", () => {
      isEraser = !isEraser;
      renderEraserState();
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
      currentPageIndex = 0;
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

    elements.deleteNoteButton.addEventListener("click", showDeleteDialog);
    elements.confirmDeleteButton.addEventListener("click", deleteSelectedNote);
    elements.cancelDeleteButton.addEventListener("click", hideDeleteDialog);

    render();
    renderThemeToggle();
    renderEraserState();
    return { store, render };
  }

  window.NotesApp = {
    APP_NAME,
    APP_LOGO_SRC,
    NOTE_TYPES,
    STORAGE_KEY,
    SELECTED_KEY,
    THEME_KEY,
    createNote,
    createStore,
    getPreview,
    getDisplayTitle,
    getInitialTheme,
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
