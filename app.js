(function () {
  "use strict";

  const STORAGE_KEY = "html-notes-app.notes";
  const SELECTED_KEY = "html-notes-app.selected";
  const THEME_KEY = "html-notes-app.theme";
  const SIDEBAR_KEY = "html-notes-app.sidebar";
  const APP_NAME = "lrc神金笔记";
  const APP_VERSION = "1.0.0";
  const APP_LOGO_SRC = "assets/logo-bird.png";
  const NOTE_TYPES = {
    text: "text",
    handwriting: "handwriting"
  };
  const DRAWING_TOOLS = {
    pen: "pen",
    eraser: "eraser",
    lasso: "lasso"
  };
  const PEN_TYPES = {
    ballpoint: "ballpoint",
    fountain: "fountain"
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

  function getInitialSidebarCollapsed(storage) {
    return storage.getItem(SIDEBAR_KEY) === "collapsed";
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
      appShell: documentRef.querySelector(".app-shell"),
      newNoteButton: documentRef.getElementById("newNoteButton"),
      emptyNewNoteButton: documentRef.getElementById("emptyNewNoteButton"),
      deleteNoteButton: documentRef.getElementById("deleteNoteButton"),
      toggleSidebarButton: documentRef.getElementById("toggleSidebarButton"),
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
      colorMenuButton: documentRef.getElementById("colorMenuButton"),
      colorSwatch: documentRef.getElementById("colorSwatch"),
      colorPalette: documentRef.getElementById("colorPalette"),
      colorOptions: Array.from(documentRef.querySelectorAll("[data-color]")),
      penSizeInput: documentRef.getElementById("penSizeInput"),
      ballpointButton: documentRef.getElementById("ballpointButton"),
      fountainPenButton: documentRef.getElementById("fountainPenButton"),
      eraserButton: documentRef.getElementById("eraserButton"),
      lassoButton: documentRef.getElementById("lassoButton"),
      clearSelectionButton: documentRef.getElementById("clearSelectionButton"),
      handwritingControls: Array.from(documentRef.querySelectorAll(".handwriting-control")),
      editorFields: documentRef.getElementById("editorFields"),
      emptyState: documentRef.getElementById("emptyState"),
      noteTypeDialog: documentRef.getElementById("noteTypeDialog"),
      noteTypeButtons: Array.from(documentRef.querySelectorAll("[data-note-type]")),
      cancelNoteTypeButton: documentRef.getElementById("cancelNoteTypeButton"),
      deleteConfirmDialog: documentRef.getElementById("deleteConfirmDialog"),
      deleteConfirmText: documentRef.getElementById("deleteConfirmText"),
      confirmDeleteButton: documentRef.getElementById("confirmDeleteButton"),
      cancelDeleteButton: documentRef.getElementById("cancelDeleteButton"),
      pageJumpDialog: documentRef.getElementById("pageJumpDialog"),
      pageJumpHint: documentRef.getElementById("pageJumpHint"),
      pageJumpInput: documentRef.getElementById("pageJumpInput"),
      confirmPageJumpButton: documentRef.getElementById("confirmPageJumpButton"),
      cancelPageJumpButton: documentRef.getElementById("cancelPageJumpButton")
    };

    const store = createStore(storage);
    let currentTheme = applyTheme(documentRef, getInitialTheme(storage));
    let sidebarCollapsed = getInitialSidebarCollapsed(storage);
    let currentPageIndex = 0;
    let saveTimer = 0;
    let isDrawing = false;
    let lastPoint = null;
    let currentTool = DRAWING_TOOLS.pen;
    let currentPenType = PEN_TYPES.ballpoint;
    let currentColor = currentTheme === "dark" ? "#eef4ff" : "#1f2933";
    let lassoPoints = [];
    let lassoBaseImage = null;
    let selection = null;
    let isDraggingSelection = false;
    let selectionDragOffset = { x: 0, y: 0 };
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

    function renderSidebar() {
      elements.appShell.classList.toggle("sidebar-collapsed", sidebarCollapsed);
      elements.toggleSidebarButton.textContent = sidebarCollapsed ? "显示侧栏" : "隐藏侧栏";
      elements.toggleSidebarButton.setAttribute("aria-pressed", String(sidebarCollapsed));
    }

    function toggleSidebar() {
      sidebarCollapsed = !sidebarCollapsed;
      storage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "collapsed" : "expanded");
      renderSidebar();
      window.setTimeout(() => renderHandwriting(getHandwritingPages(store.getSelectedNote())[currentPageIndex] || ""), 0);
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

    function getPressure(event) {
      if (typeof event.pressure === "number" && event.pressure > 0) {
        return event.pressure;
      }
      return 0.5;
    }

    function getStrokeSize(event) {
      const baseSize = getPenSize();
      if (currentTool === DRAWING_TOOLS.eraser) {
        return baseSize * 2.2;
      }
      if (currentPenType === PEN_TYPES.fountain) {
        return Math.max(1, baseSize * (0.35 + getPressure(event) * 1.65));
      }
      return baseSize;
    }

    function applyDrawingStyle() {
      if (!handwritingContext) {
        return;
      }
      handwritingContext.globalCompositeOperation = currentTool === DRAWING_TOOLS.eraser ? "destination-out" : "source-over";
      handwritingContext.lineCap = "round";
      handwritingContext.lineJoin = "round";
      handwritingContext.lineWidth = getStrokeSize({});
      handwritingContext.strokeStyle = currentTool === DRAWING_TOOLS.eraser ? "rgba(0, 0, 0, 1)" : currentColor;
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

    function getCanvasCssSize() {
      const canvas = elements.handwritingCanvas;
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      return {
        width: Math.max(1, Math.round(rect?.width || canvas.width || 900)),
        height: Math.max(1, Math.round(rect?.height || canvas.height || 560))
      };
    }

    function getCanvasImageData() {
      if (!handwritingContext?.getImageData) {
        return null;
      }
      const canvas = elements.handwritingCanvas;
      return handwritingContext.getImageData(0, 0, canvas.width, canvas.height);
    }

    function putCanvasImageData(imageData) {
      if (imageData && handwritingContext?.putImageData) {
        handwritingContext.putImageData(imageData, 0, 0);
        applyDrawingStyle();
      }
    }

    function drawLassoPath() {
      putCanvasImageData(lassoBaseImage);
      if (lassoPoints.length < 2 || !handwritingContext) {
        return;
      }
      const previousOperation = handwritingContext.globalCompositeOperation;
      const previousStroke = handwritingContext.strokeStyle;
      const previousWidth = handwritingContext.lineWidth;
      handwritingContext.globalCompositeOperation = "source-over";
      handwritingContext.strokeStyle = "#2f6fed";
      handwritingContext.lineWidth = 1.5;
      handwritingContext.beginPath();
      handwritingContext.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      lassoPoints.slice(1).forEach((point) => handwritingContext.lineTo(point.x, point.y));
      handwritingContext.stroke();
      handwritingContext.globalCompositeOperation = previousOperation;
      handwritingContext.strokeStyle = previousStroke;
      handwritingContext.lineWidth = previousWidth;
    }

    function getLassoBounds(points) {
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const minX = Math.max(0, Math.floor(Math.min(...xs)));
      const minY = Math.max(0, Math.floor(Math.min(...ys)));
      const maxX = Math.ceil(Math.max(...xs));
      const maxY = Math.ceil(Math.max(...ys));
      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY)
      };
    }

    function traceLassoPath(context, points, offsetX = 0, offsetY = 0) {
      context.beginPath();
      context.moveTo(points[0].x - offsetX, points[0].y - offsetY);
      points.slice(1).forEach((point) => context.lineTo(point.x - offsetX, point.y - offsetY));
      context.closePath();
    }

    function traceSelectionPath(context, selected) {
      context.beginPath();
      context.moveTo(selected.x + selected.pathPoints[0].x, selected.y + selected.pathPoints[0].y);
      selected.pathPoints.slice(1).forEach((point) => context.lineTo(selected.x + point.x, selected.y + point.y));
      context.closePath();
    }

    function extractSelection() {
      if (lassoPoints.length < 3 || !handwritingContext?.clip || !handwritingContext?.save) {
        lassoPoints = [];
        putCanvasImageData(lassoBaseImage);
        return;
      }
      putCanvasImageData(lassoBaseImage);
      const bounds = getLassoBounds(lassoPoints);
      const size = getCanvasCssSize();
      const selectionCanvas = documentRef.createElement("canvas");
      selectionCanvas.width = bounds.width;
      selectionCanvas.height = bounds.height;
      const selectionContext = selectionCanvas.getContext("2d");
      if (!selectionContext) {
        lassoPoints = [];
        return;
      }
      traceLassoPath(selectionContext, lassoPoints, bounds.x, bounds.y);
      selectionContext.clip();
      selectionContext.drawImage(
        elements.handwritingCanvas,
        0,
        0,
        elements.handwritingCanvas.width,
        elements.handwritingCanvas.height,
        -bounds.x,
        -bounds.y,
        size.width,
        size.height
      );

      handwritingContext.save();
      traceLassoPath(handwritingContext, lassoPoints);
      handwritingContext.clip();
      handwritingContext.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
      handwritingContext.restore();
      selection = {
        image: selectionCanvas,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pathPoints: lassoPoints.map((point) => ({
          x: point.x - bounds.x,
          y: point.y - bounds.y
        })),
        baseImage: getCanvasImageData()
      };
      lassoPoints = [];
      drawSelection(false);
      saveHandwriting();
      drawSelection(true);
    }

    function drawSelection(showOutline = true) {
      if (!selection || !handwritingContext) {
        return;
      }
      putCanvasImageData(selection.baseImage);
      const previousOperation = handwritingContext.globalCompositeOperation;
      const previousStroke = handwritingContext.strokeStyle;
      const previousWidth = handwritingContext.lineWidth;
      handwritingContext.globalCompositeOperation = "source-over";
      handwritingContext.drawImage(selection.image, selection.x, selection.y, selection.width, selection.height);
      if (showOutline && selection.pathPoints.length > 1) {
        handwritingContext.strokeStyle = "#2f6fed";
        handwritingContext.lineWidth = 1.5;
        traceSelectionPath(handwritingContext, selection);
        handwritingContext.stroke();
      }
      handwritingContext.globalCompositeOperation = previousOperation;
      handwritingContext.strokeStyle = previousStroke;
      handwritingContext.lineWidth = previousWidth;
    }

    function isPointInPolygon(point, polygon) {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;
        const crosses = yi > point.y !== yj > point.y;
        if (crosses) {
          const xAtY = ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
          if (point.x < xAtY) {
            inside = !inside;
          }
        }
      }
      return inside;
    }

    function isPointInSelection(point) {
      if (!selection) {
        return false;
      }
      const localPoint = {
        x: point.x - selection.x,
        y: point.y - selection.y
      };
      return (
        localPoint.x >= 0 &&
        localPoint.x <= selection.width &&
        localPoint.y >= 0 &&
        localPoint.y <= selection.height &&
        isPointInPolygon(localPoint, selection.pathPoints)
      );
    }

    function commitSelection() {
      if (!selection) {
        return false;
      }
      drawSelection(false);
      selection = null;
      saveHandwriting();
      renderToolState();
      return true;
    }

    function clearSelection() {
      if (!selection) {
        return;
      }
      putCanvasImageData(selection.baseImage);
      selection = null;
      saveHandwriting();
      renderToolState();
    }

    function drawPoint(point, event) {
      handwritingContext.lineWidth = getStrokeSize(event || {});
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
      const point = getCanvasPoint(event);
      if (currentTool === DRAWING_TOOLS.lasso) {
        if (isPointInSelection(point)) {
          isDraggingSelection = true;
          selectionDragOffset = {
            x: point.x - selection.x,
            y: point.y - selection.y
          };
        } else {
          commitSelection();
          lassoBaseImage = getCanvasImageData();
          lassoPoints = [point];
          isDrawing = true;
        }
        elements.handwritingCanvas.setPointerCapture?.(event.pointerId);
        return;
      }
      isDrawing = true;
      lastPoint = point;
      drawPoint(lastPoint, event);
      elements.handwritingCanvas.setPointerCapture?.(event.pointerId);
    }

    function draw(event) {
      if (!handwritingContext) {
        return;
      }
      event.preventDefault();
      const point = getCanvasPoint(event);
      if (currentTool === DRAWING_TOOLS.lasso && isDraggingSelection && selection) {
        selection.x = point.x - selectionDragOffset.x;
        selection.y = point.y - selectionDragOffset.y;
        drawSelection();
        return;
      }
      if (currentTool === DRAWING_TOOLS.lasso && isDrawing) {
        lassoPoints.push(point);
        drawLassoPath();
        return;
      }
      if (!isDrawing || !lastPoint) {
        return;
      }
      handwritingContext.lineWidth = getStrokeSize(event);
      handwritingContext.beginPath();
      handwritingContext.moveTo(lastPoint.x, lastPoint.y);
      handwritingContext.lineTo(point.x, point.y);
      handwritingContext.stroke();
      lastPoint = point;
    }

    function stopDrawing(event) {
      if (!isDrawing && !isDraggingSelection) {
        return;
      }
      event.preventDefault();
      if (currentTool === DRAWING_TOOLS.lasso && isDraggingSelection) {
        isDraggingSelection = false;
        drawSelection(false);
        selection = null;
        saveHandwriting();
        renderToolState();
        elements.handwritingCanvas.releasePointerCapture?.(event.pointerId);
        return;
      }
      if (currentTool === DRAWING_TOOLS.lasso) {
        isDrawing = false;
        extractSelection();
        renderToolState();
        elements.handwritingCanvas.releasePointerCapture?.(event.pointerId);
        return;
      }
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
      commitSelection();
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
      elements.pageJumpHint.textContent = "输入页码（1-" + pages.length + "）";
      elements.pageJumpInput.max = String(pages.length);
      elements.pageJumpInput.value = String(currentPageIndex + 1);
      elements.pageJumpDialog.hidden = false;
      elements.pageJumpInput.focus();
      elements.pageJumpInput.select();
    }

    function hidePageJumpDialog() {
      elements.pageJumpDialog.hidden = true;
    }

    function confirmPageJump() {
      const selected = store.getSelectedNote();
      if (!selected || selected.type !== NOTE_TYPES.handwriting) {
        hidePageJumpDialog();
        return;
      }
      const pages = getHandwritingPages(selected);
      const pageNumber = Number.parseInt(elements.pageJumpInput.value, 10);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pages.length) {
        return;
      }
      hidePageJumpDialog();
      updateCurrentPage(pageNumber - 1);
    }

    function addHandwritingPage() {
      commitSelection();
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

    function setTool(tool) {
      if (currentTool === DRAWING_TOOLS.lasso && tool !== DRAWING_TOOLS.lasso) {
        commitSelection();
      }
      currentTool = currentTool === tool ? DRAWING_TOOLS.pen : tool;
      renderToolState();
    }

    function setPenType(type) {
      if (currentTool === DRAWING_TOOLS.lasso) {
        commitSelection();
      }
      currentPenType = type === PEN_TYPES.fountain ? PEN_TYPES.fountain : PEN_TYPES.ballpoint;
      currentTool = DRAWING_TOOLS.pen;
      renderToolState();
    }

    function setColor(color) {
      if (currentTool === DRAWING_TOOLS.lasso) {
        commitSelection();
      }
      currentColor = color;
      elements.colorSwatch.style.setProperty("--color", currentColor);
      elements.colorPalette.hidden = true;
      elements.colorMenuButton.setAttribute("aria-expanded", "false");
      currentTool = DRAWING_TOOLS.pen;
      renderToolState();
    }

    function renderToolState() {
      elements.eraserButton.classList.toggle("active", currentTool === DRAWING_TOOLS.eraser);
      elements.eraserButton.setAttribute("aria-pressed", String(currentTool === DRAWING_TOOLS.eraser));
      elements.lassoButton.classList.toggle("active", currentTool === DRAWING_TOOLS.lasso);
      elements.lassoButton.setAttribute("aria-pressed", String(currentTool === DRAWING_TOOLS.lasso));
      elements.ballpointButton.classList.toggle("active", currentPenType === PEN_TYPES.ballpoint && currentTool === DRAWING_TOOLS.pen);
      elements.fountainPenButton.classList.toggle("active", currentPenType === PEN_TYPES.fountain && currentTool === DRAWING_TOOLS.pen);
      elements.ballpointButton.setAttribute("aria-pressed", String(currentPenType === PEN_TYPES.ballpoint && currentTool === DRAWING_TOOLS.pen));
      elements.fountainPenButton.setAttribute("aria-pressed", String(currentPenType === PEN_TYPES.fountain && currentTool === DRAWING_TOOLS.pen));
      elements.clearSelectionButton.disabled = !selection;
      elements.handwritingCanvas.classList.toggle("lasso-active", currentTool === DRAWING_TOOLS.lasso && !selection);
      elements.handwritingCanvas.classList.toggle("selection-active", Boolean(selection));
      elements.handwritingCanvas.style.cursor =
        currentTool === DRAWING_TOOLS.eraser ? "cell" : currentTool === DRAWING_TOOLS.lasso ? "copy" : "crosshair";
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
    elements.toggleSidebarButton.addEventListener("click", toggleSidebar);
    elements.themeToggle.addEventListener("click", toggleTheme);
    elements.clearHandwritingButton.addEventListener("click", () => {
      const selected = store.getSelectedNote();
      if (!selected || selected.type !== NOTE_TYPES.handwriting) {
        return;
      }
      selection = null;
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
    elements.confirmPageJumpButton.addEventListener("click", confirmPageJump);
    elements.cancelPageJumpButton.addEventListener("click", hidePageJumpDialog);
    elements.pageJumpInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        confirmPageJump();
      }
      if (event.key === "Escape") {
        hidePageJumpDialog();
      }
    });
    elements.colorMenuButton.addEventListener("click", () => {
      const isOpen = elements.colorPalette.hidden;
      elements.colorPalette.hidden = !isOpen;
      elements.colorMenuButton.setAttribute("aria-expanded", String(isOpen));
    });
    elements.colorOptions.forEach((button) => {
      button.addEventListener("click", () => setColor(button.dataset.color));
    });
    elements.penSizeInput.addEventListener("input", applyDrawingStyle);
    elements.ballpointButton.addEventListener("click", () => setPenType(PEN_TYPES.ballpoint));
    elements.fountainPenButton.addEventListener("click", () => setPenType(PEN_TYPES.fountain));
    elements.eraserButton.addEventListener("click", () => setTool(DRAWING_TOOLS.eraser));
    elements.lassoButton.addEventListener("click", () => setTool(DRAWING_TOOLS.lasso));
    elements.clearSelectionButton.addEventListener("click", clearSelection);
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
    renderSidebar();
    setColor(currentColor);
    renderToolState();
    return { store, render };
  }

  window.NotesApp = {
    APP_NAME,
    APP_VERSION,
    APP_LOGO_SRC,
    NOTE_TYPES,
    STORAGE_KEY,
    SELECTED_KEY,
    THEME_KEY,
    SIDEBAR_KEY,
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
