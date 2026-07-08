import { useCallback, useEffect, useRef, useState } from "react";
import { isPointInPolygon, type Point } from "../lib/geometry";

type Tool = "pen" | "eraser" | "lasso";
type PenType = "ballpoint" | "fountain";

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
  clearSelectionSignal
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const pageDataRef = useRef(pageData);
  const hasInitializedRef = useRef(false);
  const drawingRef = useRef(false);
  const draggingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const lassoPointsRef = useRef<Point[]>([]);
  const selectionRef = useRef<Selection | null>(null);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const [cursorClass, setCursorClass] = useState("");

  const getCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rect?.width || 900)),
      height: Math.max(1, Math.round(rect?.height || 560))
    };
  }, []);

  const applyDrawingStyle = useCallback(
    (event?: PointerEvent) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const pressure = event && event.pressure > 0 ? event.pressure : 0.5;
      const size =
        tool === "eraser" ? penSize * 2.2 : penType === "fountain" ? Math.max(1, penSize * (0.35 + pressure * 1.65)) : penSize;
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = size;
      ctx.strokeStyle = tool === "eraser" ? "rgba(0,0,0,1)" : color;
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
        image.onload = () => ctx.drawImage(image, 0, 0, width, height);
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
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(selected.image, selected.x, selected.y, selected.width, selected.height);
    ctx.globalCompositeOperation = previous;
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
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
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

  const extractSelection = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    const points = lassoPointsRef.current;
    if (!ctx || !canvas || points.length < 3) {
      lassoPointsRef.current = [];
      clearOverlay();
      return;
    }
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
  }, [clearOverlay, drawSelection, getCanvasSize, onSelectionChange, save, tracePath]);

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
    if (clearSignal === 0) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { width, height } = getCanvasSize();
    selectionRef.current = null;
    lassoPointsRef.current = [];
    onSelectionChange(false);
    clearOverlay();
    ctx.clearRect(0, 0, width, height);
    onSave("");
  }, [clearOverlay, clearSignal, getCanvasSize, onSave, onSelectionChange]);

  useEffect(() => {
    if (commitSignal > 0) commitSelection();
  }, [commitSelection, commitSignal]);

  useEffect(() => {
    if (clearSelectionSignal === 0) return;
    selectionRef.current = null;
    onSelectionChange(false);
    clearOverlay();
    save();
  }, [clearOverlay, clearSelectionSignal, onSelectionChange, save]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
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
    if (tool === "lasso" && draggingRef.current) {
      draggingRef.current = false;
      commitSelection();
      onToolChange("pen");
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (tool === "lasso" && drawingRef.current) {
      drawingRef.current = false;
      extractSelection();
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
  );
}
