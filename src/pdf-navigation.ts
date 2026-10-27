// Pure page-jump and fit-zoom calculations for the PDF view; no DOM or file access.

export type PdfFitMode = "auto" | "width" | "page";

export const PDF_MIN_ZOOM = 0.25;
export const PDF_MAX_ZOOM = 3;

export type PageInputResult = { ok: true; page: number } | { ok: false; message: string };

/** Reads a one-based page number typed by the user. */
export function parsePageInput(text: string, pageCount: number): PageInputResult {
  const message = pageCount > 0 ? `Enter a page from 1 to ${pageCount}` : "This PDF has no pages";
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, message };
  const page = Number(trimmed);
  if (page < 1 || page > pageCount) return { ok: false, message };
  return { ok: true, page };
}

/**
 * Display zoom that fits one page into the view. `page` is the page's unzoomed CSS
 * size and `padding` the unzoomed gap kept around it (it scales with the page).
 * Auto fits the width but never enlarges past 100%.
 */
export function pdfFitZoom(
  mode: PdfFitMode,
  page: { width: number; height: number },
  view: { width: number; height: number },
  padding = 18,
): number {
  const width = view.width / (page.width + padding * 2);
  const height = view.height / (page.height + padding * 2);
  const zoom = mode === "width" ? width : mode === "page" ? Math.min(width, height) : Math.min(1, width);
  return clampPdfZoom(zoom);
}

export function clampPdfZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(PDF_MIN_ZOOM, Math.min(PDF_MAX_ZOOM, zoom));
}

/** Toolbar label for the zoom state. */
export function pdfZoomLabel(zoom: number, fit: PdfFitMode | null): string {
  if (fit === "width") return "Fit Width";
  if (fit === "page") return "Fit Page";
  if (fit === "auto") return "Auto";
  return `${Math.round(zoom * 100)}%`;
}
