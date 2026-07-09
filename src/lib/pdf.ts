import { jsPDF } from "jspdf";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import type { Note } from "./types";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const pdfJsAssetBase = `${import.meta.env.BASE_URL}pdfjs/`;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function getSafeFileName(title: string, fallback = "note") {
  const safe = title.trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
  return safe || fallback;
}

async function composeHandwritingPage(backgroundData: string, handwritingData: string) {
  if (!backgroundData) return handwritingData;
  if (!handwritingData) return backgroundData;

  const [background, handwriting] = await Promise.all([loadImage(backgroundData), loadImage(handwritingData)]);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(background.width, handwriting.width);
  canvas.height = Math.max(background.height, handwriting.height);
  const context = canvas.getContext("2d");
  if (!context) return handwritingData || backgroundData;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(background, 0, 0, canvas.width, canvas.height);
  context.drawImage(handwriting, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function renderPdfFileToPages(file: File) {
  const data = await file.arrayBuffer();
  const pdfDocument = await pdfjs.getDocument({
    data,
    cMapPacked: true,
    cMapUrl: `${pdfJsAssetBase}cmaps/`,
    standardFontDataUrl: `${pdfJsAssetBase}standard_fonts/`,
    wasmUrl: `${pdfJsAssetBase}wasm/`,
    iccUrl: `${pdfJsAssetBase}iccs/`,
    useSystemFonts: true,
    verbosity: 0
  }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1400 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      continue;
    }
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pages.push(canvas.toDataURL("image/png"));
  }

  return pages.length ? pages : [""];
}

export async function exportNoteAsPdf(note: Note) {
  const filename = `${getSafeFileName(note.title)}.pdf`;

  if (note.type === "handwriting") {
    const pageCount = Math.max(note.handwritingPages.length, note.pdfBackgroundPages.length, 1);
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });

    for (let index = 0; index < pageCount; index += 1) {
      if (index > 0) {
        pdf.addPage("a4", "portrait");
      }
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pageData = await composeHandwritingPage(note.pdfBackgroundPages[index] || "", note.handwritingPages[index] || "");
      if (pageData) {
        const image = await loadImage(pageData);
        const ratio = Math.min(pageWidth / image.width, pageHeight / image.height);
        const width = image.width * ratio;
        const height = image.height * ratio;
        pdf.addImage(pageData, "PNG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
      }
    }

    pdf.save(filename);
    return;
  }

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = margin;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(note.title.trim() || "未命名笔记", margin, y);
  y += 30;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);

  const lines = pdf.splitTextToSize(note.content || "暂无内容", pageWidth - margin * 2);
  for (const line of lines) {
    if (y > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += 18;
  }

  pdf.save(filename);
}
