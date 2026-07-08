import { jsPDF } from "jspdf";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { Note } from "./types";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

export async function renderPdfFileToPages(file: File) {
  const data = await file.arrayBuffer();
  const pdfDocument = await pdfjs.getDocument({ data }).promise;
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
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pages.push(canvas.toDataURL("image/png"));
  }

  return pages.length ? pages : [""];
}

export async function exportNoteAsPdf(note: Note) {
  const filename = `${getSafeFileName(note.title)}.pdf`;

  if (note.type === "handwriting") {
    const pages = note.handwritingPages.length ? note.handwritingPages : [""];
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });

    for (let index = 0; index < pages.length; index += 1) {
      if (index > 0) {
        pdf.addPage("a4", "portrait");
      }
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      if (pages[index]) {
        const image = await loadImage(pages[index]);
        const ratio = Math.min(pageWidth / image.width, pageHeight / image.height);
        const width = image.width * ratio;
        const height = image.height * ratio;
        pdf.addImage(pages[index], "PNG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
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
