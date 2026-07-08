import { useCallback, useEffect, useRef, useState } from "react";
import { isPointInPolygon, type Point } from "../lib/geometry";

type Tool = "pen" | "eraser" | "lasso";
type PenType = "ballpoint" | "fountain" | "highlighter";

const HIGHLIGHTER_COLOR = "#fff34d";

interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

interface Selection {
  image: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  pathPoints: Point[];
}

interface Props {
  pageData: string;
  color: string;
  penSize: number;
  tool: Tool;
  penType: PenType;
  onToolChange: (tool: Tool) => void;
  onSave: (dataUrl: string) => void;
  onSelectionChange: (hasSelection: boolean) => void;
  clearSignal: number;
  commitSignal: number;
  clearSelectionSignal: number;
  undoSignal: number;
  zoomInSignal: number;
  zoomOutSignal: number;
  resetZoomSignal: number;
  redoSignal: number;
}

export function HandwritingCanvas({
  pageData,
  color,
  penSize,
  tool,
  penType,
  onToolChange,
  onSave,
  onSelectionChange,
  clearSignal,
  commitSignal,
  clearSelectionSignal,
  undoSignal,
  zoomInSignal,
  zoomOutSignal,
  resetZoomSignal,
  redoSignal
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const pageDataRef = useRef(pageData);
  const hasInitializedRef = useRef(false);
  const handledClearSignalRef = useRef(clearSignal);
  const handledCommitSignalRef = useRef(commitSignal);
  const handledClearSelectionSignalRef = useRef(clearSelectionSignal);
  const handledUndoSignalRef = useRef(undoSignal);
  const handledZoomInSignalRef = useRef(zoomInSignal);
  const handledZoomOutSignalRef = useRef(zoomOutSignal);
  const handledResetZoomSignalRef = useRef(resetZoomSignal);
  const handledRedoSignalRef = useRef(redoSignal);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const activePointersRef = useRef(new Map<number, Point>());
  const pinchStartRef = useRef<{ distance: number; center: Point; view: ViewTransform } | null>(null);
  const viewRef = useRef<ViewTransform>({ scale: 1, x: 0, y: 0 });
  const drawingRef = useRef(false);
  const draggingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const highlighterPointsRef = useRef<Point[]>([]);
  const lassoPointsRef = useRef<Point[]>([]);
  const selectionRef = useRef<Selection | null>(null);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const [cursorClass, setCursorClass] = useState("");
  const [view, setViewState] = useState<ViewTransform>(viewRef.current);

  const getCanvasSize = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    return {
      width: Math.max(1, Math.round(viewport?.clientWidth || canvas?.clientWidth || 900)),
      height: Math.max(1, Math.round(viewport?.clientHeight || canvas?.clientHeight || 560))
    };
  }, []);

  const setView = useCallback((nextView: ViewTransform) => {
    const clamped = {
      scale: Math.max(0.5, Math.min(4, nextView.scale)),
      x: nextView.x,
      y: nextView.y
    };
    viewRef.current = clamped;
    setViewState(clamped);
  }, []);

  const zoomBy = useCallback(
    (factor: number, anchor?: Point) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      const center = anchor || {
        x: Math.round((rect?.width || 0) / 2),
        y: Math.round((rect?.height || 0) / 2)
      };
      const current = viewRef.current;
      const nextScale = Math.max(0.5, Math.min(4, current.scale * factor));
      const contentPoint = {
        x: (center.x - current.x) / current.scale,
        y: (center.y - current.y) / current.scale
      };
      setView({
        scale: nextScale,
        x: center.x - contentPoint.x * nextScale,
        y: center.y - contentPoint.y * nextScale
      });
    },
    [setView]
  );

  const resetView = useCallback(() => {
    setView({ scale: 1, x: 0, y: 0 });
  }, [setView]);

  const applyDrawingStyle = useCallback(
    (event?: PointerEvent) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const pressure = event && event.pressure > 0 ? event.pressure : 0.5;
      const size =
        tool === "eraser"
          ? penSize * 2.2
          : penType === "highlighter"
            ? penSize * 3.6
            : penType === "fountain"
              ? Math.max(1, penSize * (0.35 + pressure * 1.65))
              : penSize;
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = size;
      ctx.strokeStyle = tool === "eraser" ? "rgba(0,0,0,1)" : penType === "highlighter" ? HIGHLIGHTER_COLOR : color;
      ctx.fillStyle = ctx.strokeStyle;
    },
    [color, penSize, penType, tool]
  );

  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const ctx = overlayCtxRef.current;
    if (!overlay || !ctx) return;
    const { width, height } = getCanvasSize();
    ctx.clearRect(0, 0, width, height);
  }, [getCanvasSize]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const ctx = ctxRef.current;
    const overlayCtx = overlayCtxRef.current;
    if (!canvas || !ctx) return;
    const { width, height } = getCanvasSize();
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      const previous = canvas.toDataURL("image/png");
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (previous) {
        const image = new Image();
        image.onload = () => {
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
          ctx.drawImage(image, 0, 0, width, height);
          applyDrawingStyle();
        };
        image.src = previous;
      }
    } else {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    if (overlay && overlayCtx) {
      overlay.width = canvas.width;
      overlay.height = canvas.height;
      overlayCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    applyDrawingStyle();
  }, [applyDrawingStyle, getCanvasSize]);

  const renderPage = useCallback(
    (data: string, clearBeforeLoad = false) => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;
      resizeCanvas();
      const { width, height } = getCanvasSize();
      if (!data) {
        ctx.clearRect(0, 0, width, height);
        return;
      }
      if (clearBeforeLoad) {
        ctx.clearRect(0, 0, width, height);
      }
      const image = new Image();
      image.onload = () => {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        applyDrawingStyle();
      };
      image.src = data;
    },
    [applyDrawingStyle, getCanvasSize, resizeCanvas]
  );

  const save = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    pageDataRef.current = dataUrl;
    onSave(dataUrl);
  }, [onSave]);

  const pushUndoState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const stack = undoStackRef.current;
    if (stack[stack.length - 1] === dataUrl) return;
    stack.push(dataUrl);
    redoStackRef.current = [];
    if (stack.length > 40) {
      stack.shift();
    }
  }, []);

  const restorePage = useCallback(
    (data: string) => {
      selectionRef.current = null;
      lassoPointsRef.current = [];
      highlighterPointsRef.current = [];
      drawingRef.current = false;
      draggingRef.current = false;
      lastPointRef.current = null;
      onSelectionChange(false);
      clearOverlay();
      pageDataRef.current = data;
      renderPage(data);
      onSave(data);
    },
    [clearOverlay, onSave, onSelectionChange, renderPage]
  );

  const tracePath = useCallback((ctx: CanvasRenderingContext2D, points: Point[], offsetX = 0, offsetY = 0) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x - offsetX, points[0].y - offsetY);
    points.slice(1).forEach((point) => ctx.lineTo(point.x - offsetX, point.y - offsetY));
    ctx.closePath();
  }, []);

  const drawSelection = useCallback(
    (showOutline = true) => {
      const ctx = overlayCtxRef.current;
      const selected = selectionRef.current;
      if (!ctx || !selected) return;
      clearOverlay();
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(selected.image, selected.x, selected.y, selected.width, selected.height);
      if (showOutline && selected.pathPoints.length > 1) {
        ctx.strokeStyle = "#2f6fed";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(selected.x + selected.pathPoints[0].x, selected.y + selected.pathPoints[0].y);
        selected.pathPoints.slice(1).forEach((point) => ctx.lineTo(selected.x + point.x, selected.y + point.y));
        ctx.closePath();
        ctx.stroke();
      }
    },
    [clearOverlay]
  );

  const commitSelection = useCallback(() => {
    const ctx = ctxRef.current;
    const selected = selectionRef.current;
    if (!ctx || !selected) return false;
    const previous = ctx.globalCompositeOperation;
    const previousAlpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(selected.image, selected.x, selected.y, selected.width, selected.height);
    ctx.globalCompositeOperation = previous;
    ctx.globalAlpha = previousAlpha;
    selectionRef.current = null;
    onSelectionChange(false);
    clearOverlay();
    applyDrawingStyle();
    save();
    return true;
  }, [applyDrawingStyle, clearOverlay, onSelectionChange, save]);

  const getPoint = useCallback((event: PointerEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / viewRef.current.scale,
      y: (event.clientY - rect.top) / viewRef.current.scale
    };
  }, []);

  const drawLassoPath = useCallback(() => {
    const ctx = overlayCtxRef.current;
    const points = lassoPointsRef.current;
    if (!ctx || points.length < 2) return;
    clearOverlay();
    ctx.strokeStyle = "#2f6fed";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
    ctx.setLineDash([]);
  }, [clearOverlay]);

  const strokeHighlighterPath = useCallback(
    (ctx: CanvasRenderingContext2D, points: Point[], alpha: number) => {
      if (points.length === 0) return;
      const previousOperation = ctx.globalCompositeOperation;
      const previousAlpha = ctx.globalAlpha;
      const previousStroke = ctx.strokeStyle;
      const previousWidth = ctx.lineWidth;
      const previousCap = ctx.lineCap;
      const previousJoin = ctx.lineJoin;

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = HIGHLIGHTER_COLOR;
      ctx.lineWidth = Math.max(8, penSize * 3.6);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      if (points.length === 1) {
        ctx.lineTo(points[0].x + 0.01, points[0].y + 0.01);
      } else {
        points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      }
      ctx.stroke();

      ctx.globalCompositeOperation = previousOperation;
      ctx.globalAlpha = previousAlpha;
      ctx.strokeStyle = previousStroke;
      ctx.lineWidth = previousWidth;
      ctx.lineCap = previousCap;
      ctx.lineJoin = previousJoin;
    },
    [penSize]
  );

  const drawHighlighterPreview = useCallback(() => {
    const ctx = overlayCtxRef.current;
    if (!ctx) return;
    clearOverlay();
    strokeHighlighterPath(ctx, highlighterPointsRef.current, 0.62);
  }, [clearOverlay, strokeHighlighterPath]);

  const commitHighlighterStroke = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || highlighterPointsRef.current.length === 0) return;
    strokeHighlighterPath(ctx, highlighterPointsRef.current, 0.62);
    highlighterPointsRef.current = [];
    clearOverlay();
    applyDrawingStyle();
    save();
  }, [applyDrawingStyle, clearOverlay, save, strokeHighlighterPath]);

  const extractSelection = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    const points = lassoPointsRef.current;
    if (!ctx || !canvas || points.length < 3) {
      lassoPointsRef.current = [];
      clearOverlay();
      return;
    }
    pushUndoState();
    clearOverlay();
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxX = Math.ceil(Math.max(...xs));
    const maxY = Math.ceil(Math.max(...ys));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const selectionCanvas = document.createElement("canvas");
    selectionCanvas.width = width;
    selectionCanvas.height = height;
    const selectionCtx = selectionCanvas.getContext("2d");
    if (!selectionCtx) return;
    tracePath(selectionCtx, points, minX, minY);
    selectionCtx.clip();
    const size = getCanvasSize();
    selectionCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, -minX, -minY, size.width, size.height);
    ctx.save();
    tracePath(ctx, points);
    ctx.clip();
    ctx.clearRect(minX, minY, width, height);
    ctx.restore();
    selectionRef.current = {
      image: selectionCanvas,
      x: minX,
      y: minY,
      width,
      height,
      pathPoints: points.map((point) => ({ x: point.x - minX, y: point.y - minY }))
    };
    lassoPointsRef.current = [];
    onSelectionChange(true);
    drawSelection();
  }, [clearOverlay, drawSelection, getCanvasSize, onSelectionChange, pushUndoState, save, tracePath]);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    ctxRef.current = canvas.getContext("2d");
    overlayCtxRef.current = overlay.getContext("2d");
    hasInitializedRef.current = true;
    pageDataRef.current = pageData;
    renderPage(pageData, true);
  }, [pageData, renderPage]);

  useEffect(() => {
    if (pageDataRef.current !== pageData) {
      pageDataRef.current = pageData;
      selectionRef.current = null;
      onSelectionChange(false);
      clearOverlay();
      renderPage(pageData);
    }
  }, [clearOverlay, onSelectionChange, pageData, renderPage]);

  useEffect(() => {
    applyDrawingStyle();
    setCursorClass(tool === "lasso" ? "lasso-active" : tool === "eraser" ? "eraser-active" : "");
  }, [applyDrawingStyle, tool]);

  useEffect(() => {
    const onResize = () => renderPage(pageDataRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderPage]);

  useEffect(() => {
    if (clearSignal === 0 || handledClearSignalRef.current === clearSignal) return;
    handledClearSignalRef.current = clearSignal;
    const ctx = ctxRef.current;
    if (!ctx) return;
    pushUndoState();
    const { width, height } = getCanvasSize();
    selectionRef.current = null;
    lassoPointsRef.current = [];
    highlighterPointsRef.current = [];
    drawingRef.current = false;
    draggingRef.current = false;
    lastPointRef.current = null;
    onSelectionChange(false);
    clearOverlay();
    ctx.clearRect(0, 0, width, height);
    pageDataRef.current = "";
    onSave("");
  }, [clearOverlay, clearSignal, getCanvasSize, onSave, onSelectionChange, pushUndoState]);

  useEffect(() => {
    if (commitSignal === 0 || handledCommitSignalRef.current === commitSignal) return;
    handledCommitSignalRef.current = commitSignal;
    commitSelection();
  }, [commitSelection, commitSignal]);

  useEffect(() => {
    if (clearSelectionSignal === 0 || handledClearSelectionSignalRef.current === clearSelectionSignal) return;
    handledClearSelectionSignalRef.current = clearSelectionSignal;
    selectionRef.current = null;
    lassoPointsRef.current = [];
    highlighterPointsRef.current = [];
    drawingRef.current = false;
    draggingRef.current = false;
    lastPointRef.current = null;
    onSelectionChange(false);
    clearOverlay();
    applyDrawingStyle();
    save();
  }, [applyDrawingStyle, clearOverlay, clearSelectionSignal, onSelectionChange, save]);

  useEffect(() => {
    if (undoSignal === 0 || handledUndoSignalRef.current === undoSignal) return;
    handledUndoSignalRef.current = undoSignal;
    const canvas = canvasRef.current;
    const previous = undoStackRef.current.pop();
    if (previous !== undefined && canvas) {
      redoStackRef.current.push(canvas.toDataURL("image/png"));
      restorePage(previous);
    }
  }, [restorePage, undoSignal]);

  useEffect(() => {
    if (redoSignal === 0 || handledRedoSignalRef.current === redoSignal) return;
    handledRedoSignalRef.current = redoSignal;
    const canvas = canvasRef.current;
    const next = redoStackRef.current.pop();
    if (next !== undefined && canvas) {
      undoStackRef.current.push(canvas.toDataURL("image/png"));
      restorePage(next);
    }
  }, [redoSignal, restorePage]);

  useEffect(() => {
    if (zoomInSignal === 0 || handledZoomInSignalRef.current === zoomInSignal) return;
    handledZoomInSignalRef.current = zoomInSignal;
    zoomBy(1.2);
  }, [zoomBy, zoomInSignal]);

  useEffect(() => {
    if (zoomOutSignal === 0 || handledZoomOutSignalRef.current === zoomOutSignal) return;
    handledZoomOutSignalRef.current = zoomOutSignal;
    zoomBy(1 / 1.2);
  }, [zoomBy, zoomOutSignal]);

  useEffect(() => {
    if (resetZoomSignal === 0 || handledResetZoomSignalRef.current === resetZoomSignal) return;
    handledResetZoomSignalRef.current = resetZoomSignal;
    resetView();
  }, [resetView, resetZoomSignal]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointersRef.current.size >= 2) {
      drawingRef.current = false;
      draggingRef.current = false;
      lastPointRef.current = null;
      const points = Array.from(activePointersRef.current.values()).slice(0, 2);
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const rect = viewportRef.current?.getBoundingClientRect();
      pinchStartRef.current = {
        distance: Math.max(1, distance),
        center: {
          x: (points[0].x + points[1].x) / 2 - (rect?.left || 0),
          y: (points[0].y + points[1].y) / 2 - (rect?.top || 0)
        },
        view: viewRef.current
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    resizeCanvas();
    const point = getPoint(event.nativeEvent);
    if (tool === "lasso") {
      const selected = selectionRef.current;
      if (selected) {
        const localPoint = { x: point.x - selected.x, y: point.y - selected.y };
        if (
          localPoint.x >= 0 &&
          localPoint.x <= selected.width &&
          localPoint.y >= 0 &&
          localPoint.y <= selected.height &&
          isPointInPolygon(localPoint, selected.pathPoints)
        ) {
          draggingRef.current = true;
          dragOffsetRef.current = { x: point.x - selected.x, y: point.y - selected.y };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
      }
      commitSelection();
      lassoPointsRef.current = [point];
      drawingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    pushUndoState();
    if (tool === "pen" && penType === "highlighter") {
      highlighterPointsRef.current = [point];
      drawingRef.current = true;
      lastPointRef.current = point;
      drawHighlighterPreview();
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    drawingRef.current = true;
    lastPointRef.current = point;
    applyDrawingStyle(event.nativeEvent);
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (activePointersRef.current.size >= 2 && pinchStartRef.current) {
      const points = Array.from(activePointersRef.current.values()).slice(0, 2);
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const rect = viewportRef.current?.getBoundingClientRect();
      const center = {
        x: (points[0].x + points[1].x) / 2 - (rect?.left || 0),
        y: (points[0].y + points[1].y) / 2 - (rect?.top || 0)
      };
      const start = pinchStartRef.current;
      const contentPoint = {
        x: (start.center.x - start.view.x) / start.view.scale,
        y: (start.center.y - start.view.y) / start.view.scale
      };
      const nextScale = Math.max(0.5, Math.min(4, start.view.scale * (distance / start.distance)));
      setView({
        scale: nextScale,
        x: center.x - contentPoint.x * nextScale,
        y: center.y - contentPoint.y * nextScale
      });
      return;
    }
    const point = getPoint(event.nativeEvent);
    if (tool === "lasso" && draggingRef.current && selectionRef.current) {
      selectionRef.current.x = point.x - dragOffsetRef.current.x;
      selectionRef.current.y = point.y - dragOffsetRef.current.y;
      drawSelection();
      return;
    }
    if (tool === "lasso" && drawingRef.current) {
      lassoPointsRef.current.push(point);
      drawLassoPath();
      return;
    }
    if (tool === "pen" && penType === "highlighter" && drawingRef.current) {
      highlighterPointsRef.current.push(point);
      lastPointRef.current = point;
      drawHighlighterPreview();
      return;
    }
    const ctx = ctxRef.current;
    const lastPoint = lastPointRef.current;
    if (!drawingRef.current || !ctx || !lastPoint) return;
    applyDrawingStyle(event.nativeEvent);
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }
    if (activePointersRef.current.size > 0) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (tool === "lasso" && draggingRef.current) {
      draggingRef.current = false;
      commitSelection();
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (tool === "lasso" && drawingRef.current) {
      drawingRef.current = false;
      extractSelection();
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (tool === "pen" && penType === "highlighter" && drawingRef.current) {
      drawingRef.current = false;
      lastPointRef.current = null;
      commitHighlighterStroke();
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    save();
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className="handwriting-panel" aria-label="手写内容">
      <div ref={viewportRef} className="handwriting-viewport">
        <div className="handwriting-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <canvas
            ref={canvasRef}
            className={`handwriting-canvas ${cursorClass} ${selectionRef.current ? "selection-active" : ""}`}
            aria-label="手写画布"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <canvas ref={overlayRef} className="selection-overlay" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
