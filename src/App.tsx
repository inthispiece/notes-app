import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  FilePenLine,
  Highlighter,
  Maximize2,
  Menu,
  Moon,
  Paintbrush,
  PenLine,
  Plus,
  Search,
  Sun,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { HandwritingCanvas } from "./components/HandwritingCanvas";
import { formatNoteDate, getDisplayTitle, getPreview } from "./lib/notes";
import { IndexedDbNotesRepository } from "./lib/repository";
import { applyTheme, getInitialTheme } from "./lib/theme";
import {
  APP_LOGO_SRC,
  APP_NAME,
  LEGACY_SIDEBAR_KEY,
  type Note,
  type NoteType,
  type SaveState,
  type ThemeMode
} from "./lib/types";

type Tool = "pen" | "eraser" | "lasso";
type PenType = "ballpoint" | "fountain" | "highlighter";

const PEN_COLORS = ["#1f2933", "#ef4444", "#facc15", "#2563eb", "#16a34a", "#7c3aed", "#eef4ff"];

const repository = new IndexedDbNotesRepository();

function getInitialSidebarCollapsed() {
  return localStorage.getItem(LEGACY_SIDEBAR_KEY) === "collapsed";
}

export function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [dialog, setDialog] = useState<"new" | "delete" | "page" | null>(null);
  const [pageInput, setPageInput] = useState("1");
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [penType, setPenType] = useState<PenType>("ballpoint");
  const [penSize, setPenSize] = useState(4);
  const [penColor, setPenColor] = useState("#1f2933");
  const [colorOpen, setColorOpen] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [commitSignal, setCommitSignal] = useState(0);
  const [clearSelectionSignal, setClearSelectionSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const [zoomInSignal, setZoomInSignal] = useState(0);
  const [zoomOutSignal, setZoomOutSignal] = useState(0);
  const [resetZoomSignal, setResetZoomSignal] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  const saveTimer = useRef<number>();

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedId) || null, [notes, selectedId]);

  const refresh = useCallback(async () => {
    const nextNotes = await repository.listNotes();
    const nextSelected = await repository.getSelectedId();
    setNotes(nextNotes);
    setSelectedId(nextSelected || nextNotes[0]?.id || "");
  }, []);

  useEffect(() => {
    let active = true;
    repository.migrateFromLegacyLocalStorage().then(async () => {
      if (!active) return;
      await refresh();
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("html-notes-app.theme", theme);
    setPenColor((current) => (current === "#eef4ff" || current === "#1f2933" ? (theme === "dark" ? "#eef4ff" : "#1f2933") : current));
  }, [theme]);

  const scheduleSaved = useCallback(() => {
    setSaveState("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setSaveState("saved"), 250);
  }, []);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter((note) => {
      const typeLabel = note.type === "handwriting" ? "手写笔记" : "文本笔记";
      return note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query) || typeLabel.includes(query);
    });
  }, [notes, search]);

  const updateSelected = useCallback(
    async (fields: Partial<Pick<Note, "title" | "content" | "handwritingPages">>) => {
      if (!selectedNote) return;
      const updated = await repository.updateNote(selectedNote.id, fields);
      if (!updated) return;
      setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      scheduleSaved();
    },
    [scheduleSaved, selectedNote]
  );

  const createNewNote = async (type: NoteType) => {
    const note = await repository.createNote(type);
    setSearch("");
    setDialog(null);
    setCurrentPageIndex(0);
    setSelectedId(note.id);
    await refresh();
    scheduleSaved();
  };

  const selectNote = async (id: string) => {
    setCommitSignal((value) => value + 1);
    await repository.setSelectedId(id);
    setSelectedId(id);
    setCurrentPageIndex(0);
    setHasSelection(false);
  };

  const deleteSelected = async () => {
    if (!selectedNote) return;
    await repository.deleteNote(selectedNote.id);
    setDialog(null);
    setCurrentPageIndex(0);
    await refresh();
    scheduleSaved();
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem(LEGACY_SIDEBAR_KEY, next ? "collapsed" : "expanded");
      return next;
    });
  };

  const pages = selectedNote?.type === "handwriting" ? (selectedNote.handwritingPages.length ? selectedNote.handwritingPages : [""]) : [""];
  const pageData = pages[Math.min(currentPageIndex, pages.length - 1)] || "";

  const saveHandwritingPage = useCallback(
    (dataUrl: string) => {
      if (!selectedNote || selectedNote.type !== "handwriting") return;
      const nextPages = selectedNote.handwritingPages.length ? selectedNote.handwritingPages.slice() : [""];
      nextPages[currentPageIndex] = dataUrl;
      void updateSelected({ handwritingPages: nextPages });
    },
    [currentPageIndex, selectedNote, updateSelected]
  );

  const movePage = (offset: number) => {
    setCommitSignal((value) => value + 1);
    setCurrentPageIndex((index) => Math.max(0, Math.min(index + offset, pages.length - 1)));
  };

  const addPage = async () => {
    if (!selectedNote || selectedNote.type !== "handwriting") return;
    setCommitSignal((value) => value + 1);
    const nextPages = selectedNote.handwritingPages.length ? selectedNote.handwritingPages.slice() : [""];
    nextPages.push("");
    await updateSelected({ handwritingPages: nextPages });
    setCurrentPageIndex(nextPages.length - 1);
  };

  const confirmPageJump = () => {
    const pageNumber = Number.parseInt(pageInput, 10);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pages.length) return;
    setCommitSignal((value) => value + 1);
    setCurrentPageIndex(pageNumber - 1);
    setDialog(null);
  };

  const setDrawingTool = (nextTool: Tool) => {
    if (tool === "lasso" && nextTool !== "lasso") {
      setCommitSignal((value) => value + 1);
    }
    setTool((current) => (current === nextTool ? "pen" : nextTool));
  };

  const setDrawingPenType = (nextPenType: PenType) => {
    if (tool === "lasso") {
      setCommitSignal((value) => value + 1);
    }
    setPenType(nextPenType);
    if (nextPenType === "highlighter") {
      setPenColor("#facc15");
    }
    setTool("pen");
  };

  return (
    <>
      <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} aria-label={APP_NAME}>
        <aside className="sidebar" aria-label="笔记列表">
          <header className="sidebar-header">
            <div className="brand" aria-label={APP_NAME}>
              <img className="brand-logo" src={APP_LOGO_SRC} alt="应用 logo" />
              <h1>{APP_NAME}</h1>
            </div>
            <button className="icon-button primary" type="button" aria-label="新建笔记" title="新建笔记" onClick={() => setDialog("new")}>
              <Plus size={22} />
            </button>
          </header>
          <label className="search-box">
            <Search size={18} aria-hidden="true" />
            <span className="visually-hidden">搜索笔记</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="搜索标题或内容" autoComplete="off" />
          </label>
          <ul className="note-list" aria-label="笔记">
            {filteredNotes.map((note) => (
              <li key={note.id}>
                <button className={`note-item ${note.id === selectedId ? "active" : ""}`} type="button" aria-current={note.id === selectedId} onClick={() => selectNote(note.id)}>
                  <span className="note-title">{getDisplayTitle(note.title)}</span>
                  <span className="note-preview">{getPreview(note)}</span>
                  <span className="note-date">{formatNoteDate(note.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="editor" aria-label="笔记内容">
          <header className="editor-toolbar">
            <div className="status-group">
              <span>{notes.length} 条笔记</span>
              <span aria-live="polite">{saveState === "saving" ? "正在保存..." : "已保存"}</span>
            </div>
            <div className="toolbar-actions">
              <button className="icon-text-button" type="button" aria-pressed={sidebarCollapsed} onClick={toggleSidebar}>
                <Menu size={17} />
                <span>{sidebarCollapsed ? "显示侧栏" : "隐藏侧栏"}</span>
              </button>
              {selectedNote?.type === "handwriting" && (
                <>
                  <button className="icon-button" type="button" aria-label="上一页" disabled={currentPageIndex === 0} onClick={() => movePage(-1)}>
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="page-indicator"
                    type="button"
                    onClick={() => {
                      setPageInput(String(currentPageIndex + 1));
                      setDialog("page");
                    }}
                  >
                    {currentPageIndex + 1} / {pages.length}
                  </button>
                  <button className="icon-button" type="button" aria-label="下一页" disabled={currentPageIndex >= pages.length - 1} onClick={() => movePage(1)}>
                    <ChevronRight size={18} />
                  </button>
                  <button className="icon-text-button" type="button" onClick={addPage}>
                    <Plus size={17} />
                    <span>新页</span>
                  </button>
                  <button className="icon-button" type="button" aria-label="撤销" title="撤销" onClick={() => setUndoSignal((value) => value + 1)}>
                    <Undo2 size={17} />
                  </button>
                  <button className="icon-button" type="button" aria-label="缩小" title="缩小" onClick={() => setZoomOutSignal((value) => value + 1)}>
                    <ZoomOut size={17} />
                  </button>
                  <button className="icon-button" type="button" aria-label="放大" title="放大" onClick={() => setZoomInSignal((value) => value + 1)}>
                    <ZoomIn size={17} />
                  </button>
                  <button className="icon-button" type="button" aria-label="重置缩放" title="重置缩放" onClick={() => setResetZoomSignal((value) => value + 1)}>
                    <Maximize2 size={17} />
                  </button>
                  <div className="color-picker">
                    <button className="color-menu-button" type="button" aria-label="笔颜色" aria-expanded={colorOpen} onClick={() => setColorOpen((open) => !open)}>
                      <span className="color-swatch" style={{ "--color": penColor } as React.CSSProperties} aria-hidden="true" />
                    </button>
                    {colorOpen && (
                      <div className="color-palette">
                        {PEN_COLORS.map((color) => (
                          <button
                            className="color-option"
                            key={color}
                            type="button"
                            style={{ "--color": color } as React.CSSProperties}
                            aria-label={`选择 ${color}`}
                            onClick={() => {
                              setPenColor(color);
                              setColorOpen(false);
                              setTool("pen");
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <label className="pen-size-control" title="笔粗细">
                    <span className="visually-hidden">笔粗细</span>
                    <input type="range" min="1" max="18" value={penSize} aria-label="笔粗细" onChange={(event) => setPenSize(Number(event.target.value))} />
                  </label>
                  <button className={`icon-text-button ${penType === "ballpoint" && tool === "pen" ? "active" : ""}`} type="button" aria-pressed={penType === "ballpoint" && tool === "pen"} onClick={() => setDrawingPenType("ballpoint")}>
                    <PenLine size={17} />
                    <span>圆珠笔</span>
                  </button>
                  <button className={`icon-text-button ${penType === "fountain" && tool === "pen" ? "active" : ""}`} type="button" aria-pressed={penType === "fountain" && tool === "pen"} onClick={() => setDrawingPenType("fountain")}>
                    <Paintbrush size={17} />
                    <span>钢笔</span>
                  </button>
                  <button className={`icon-text-button ${penType === "highlighter" && tool === "pen" ? "active" : ""}`} type="button" aria-pressed={penType === "highlighter" && tool === "pen"} onClick={() => setDrawingPenType("highlighter")}>
                    <Highlighter size={17} />
                    <span>荧光笔</span>
                  </button>
                  <button className={`icon-text-button ${tool === "eraser" ? "active" : ""}`} type="button" aria-pressed={tool === "eraser"} onClick={() => setDrawingTool("eraser")}>
                    <Eraser size={17} />
                    <span>橡皮</span>
                  </button>
                  <button className={`icon-text-button ${tool === "lasso" ? "active" : ""}`} type="button" aria-pressed={tool === "lasso"} onClick={() => setDrawingTool("lasso")}>
                    <FilePenLine size={17} />
                    <span>套索</span>
                  </button>
                  <button className="icon-text-button" type="button" disabled={!hasSelection} onClick={() => setClearSelectionSignal((value) => value + 1)}>
                    <X size={17} />
                    <span>清除选区</span>
                  </button>
                  <button className="icon-text-button" type="button" onClick={() => setClearSignal((value) => value + 1)}>
                    <Trash2 size={17} />
                    <span>清空</span>
                  </button>
                </>
              )}
              <button className="icon-text-button danger" type="button" disabled={!selectedNote} onClick={() => setDialog("delete")}>
                <Trash2 size={17} />
                <span>删除</span>
              </button>
            </div>
          </header>

          {selectedNote ? (
            <div className="editor-fields">
              <input className="title-input" value={selectedNote.title} type="text" placeholder="标题" aria-label="标题" onChange={(event) => updateSelected({ title: event.target.value })} />
              {selectedNote.type === "text" ? (
                <textarea className="content-input" value={selectedNote.content} placeholder="开始记录..." aria-label="内容" onChange={(event) => updateSelected({ content: event.target.value })} />
              ) : (
                <HandwritingCanvas
                  pageData={pageData}
                  color={penColor}
                  penSize={penSize}
                  tool={tool}
                  penType={penType}
                  onToolChange={setTool}
                  onSave={saveHandwritingPage}
                  onSelectionChange={setHasSelection}
                  clearSignal={clearSignal}
                  commitSignal={commitSignal}
                  clearSelectionSignal={clearSelectionSignal}
                  undoSignal={undoSignal}
                  zoomInSignal={zoomInSignal}
                  zoomOutSignal={zoomOutSignal}
                  resetZoomSignal={resetZoomSignal}
                />
              )}
            </div>
          ) : (
            <div className="empty-state">
              <h2>选择或新建一条笔记</h2>
              <p>笔记会保存在当前设备，可在离线时继续编辑核心内容。</p>
              <button className="icon-text-button primary" type="button" onClick={() => setDialog("new")}>
                <Plus size={18} />
                <span>新建笔记</span>
              </button>
            </div>
          )}
        </section>
      </main>

      <button className="theme-toggle" type="button" aria-label={theme === "dark" ? "切换为浅色模式" : "切换为深色模式"} title={theme === "dark" ? "切换为浅色模式" : "切换为深色模式"} onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        <span>{theme === "dark" ? "浅色" : "深色"}</span>
      </button>

      {dialog === "new" && (
        <Dialog title="新建笔记" onClose={() => setDialog(null)}>
          <div className="note-type-actions">
            <button className="icon-text-button primary note-type-button" type="button" onClick={() => createNewNote("text")}>
              <PenLine size={18} />
              <span>文本笔记</span>
            </button>
            <button className="icon-text-button primary note-type-button" type="button" onClick={() => createNewNote("handwriting")}>
              <FilePenLine size={18} />
              <span>手写笔记</span>
            </button>
          </div>
        </Dialog>
      )}

      {dialog === "delete" && selectedNote && (
        <Dialog title="删除笔记" onClose={() => setDialog(null)}>
          <p>确定删除“{getDisplayTitle(selectedNote.title)}”吗？</p>
          <div className="note-type-actions">
            <button className="icon-text-button danger" type="button" onClick={deleteSelected}>
              <Trash2 size={18} />
              <span>删除</span>
            </button>
            <button className="icon-text-button" type="button" onClick={() => setDialog(null)}>
              <X size={18} />
              <span>取消</span>
            </button>
          </div>
        </Dialog>
      )}

      {dialog === "page" && (
        <Dialog title="跳转页码" onClose={() => setDialog(null)}>
          <label className="page-jump-field">
            <span>输入页码（1-{pages.length}）</span>
            <input value={pageInput} type="number" min="1" max={pages.length} step="1" inputMode="numeric" onChange={(event) => setPageInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && confirmPageJump()} />
          </label>
          <div className="note-type-actions">
            <button className="icon-text-button primary" type="button" onClick={confirmPageJump}>
              <ChevronRight size={18} />
              <span>跳转</span>
            </button>
            <button className="icon-text-button" type="button" onClick={() => setDialog(null)}>
              <X size={18} />
              <span>取消</span>
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="note-type-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="note-type-panel">
        <div className="dialog-title-row">
          <h2 id="dialog-title">{title}</h2>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
