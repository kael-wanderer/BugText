import { invoke } from "@tauri-apps/api/core";
import { readPdfDraft, writePdfDraft } from "./pdf-draft-store";
import type { AnnotationStore } from "./pdf-annotations/store";
import type { AnnotationLayer } from "./pdf-annotations/layer";
import type { Annotation } from "./pdf-annotations/model";
import type { createAnnotationsPanel as createPanelType } from "./pdf-annotations/panel";
import { copyQuote } from "./pdf-annotations/quote";

import { confirm, message } from "@tauri-apps/plugin-dialog";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pickExportPath, pickImagePath } from "./files";
import {
  createPdfToolbar,
  toolForKey,
  type PdfEditTool,
  type PdfPanel,
  type PdfToolbarCommand,
} from "./pdf-toolbar";
import {
  PDF_INSPECTOR_WIDTH,
  createPdfInspector,
  type PdfInspectorContent,
  type PdfInspectorPage,
} from "./pdf-inspector";
import { OCR_LANGUAGES, bundledOcrLanguage, recognizePdfPageCanvas } from "./pdf-ocr";
import { parsePageInput, pdfFitZoom, pdfZoomLabel, type PdfFitMode } from "./pdf-navigation";
import {
  pdfCapabilityDetail,
  pdfCapabilityDetails,
  pdfCapabilityMessage,
  pdfPageCapabilityMessage,
  summarizePdfCapabilities,
  type PdfCapabilitySummary,
  type PdfPageTextSignal,
} from "./pdf-edit-capabilities";
import {
  DEFAULT_PDF_TEXT_STYLE,
  addPdfEditOperation,
  createPdfEditDocument,
  hasPdfEdits,
  pdfDraftIsStale,
  pdfSourceDigest,
  normalizePdfRect,
  parsePdfEditDocument,
  removePdfEditOperation,
  serializePdfEditDocument,
  snapPdfRect,
  type PdfEditDocument,
  type PdfEditOperation,
  type PdfPageBox,
  type PdfRect,
} from "./pdf-edit-document";
import {
  estimatePdfFontSizeFromSelectionRects,
  pdfSelectionClientRectsToPageRects,
  pdfSelectionClientRectToPageRect,
  pdfTextStyleFromSelectionCss,
} from "./pdf-selection-edit";
import {
  inspectPdfPageAnnotations,
  inspectPdfPageOperators,
  mergePdfPageObjectSignals,
  pdfObjectSignalMessage,
  type PdfPageObjectSignal,
} from "./pdf-object-inspection";
import {
  inspectPdfPageFonts,
  pdfFontSignalMessage,
  type PdfPageFontSignal,
  type PdfTextContentItemLike,
  type PdfTextContentStyleLike,
} from "./pdf-font-inspection";
import {
  listOcrReviewItems,
  removeOcrReviewItem,
  summarizeOcrReview,
  updateOcrReviewText,
} from "./pdf-ocr-review";
import {
  listPdfProofIssues,
  reflowPdfEditOperationText,
  updatePdfEditOperationText,
} from "./pdf-proofing";
import { installReadableStreamAsyncIterator } from "./readable-stream-iter";
import { manualBinarySnapshot } from "./recovery";
import type { PdfFontBytesLoader } from "./pdf-unicode-fonts";

export type PdfFindHandle = {
  goToPage(page: number): void;
  flashAnnotation(id: string): void;
  pageCount(): number;
  setQuery: (query: string) => number;
  move: (delta: number) => { count: number; active: number };
  clear: () => void;
  /** Reloads when the file changed on disk, or asks first when there are unsaved edits. */
  checkDisk: () => Promise<void>;
  /** Display zoom that fits the page in view, or null while the pane has no size. */
  fitZoom: (mode: PdfFitMode) => number | null;
  /** Shows the workbench's zoom state in the toolbar. */
  setZoomState: (zoom: number, fit: PdfFitMode | null) => void;
  /** Runs a zoom change while keeping the same spot of the page in view. */
  keepAnchor: (change: () => void) => void;
  destroy: () => void;
};

export type PdfRenderOptions = {
  initialPage?: number;
  folder?: string | null;
  onExportAnnotations?: (items: Annotation[], title: string, path: string) => void;
  onEditDirtyChange?: (dirty: boolean) => void;
  onReloadRequest?: () => void;
  /** The page in view changed (one-based). */
  onPageChange?: (page: number, pageCount: number) => void;
  /** Return false once another document owns `host`; loading then stops before touching it. */
  isCurrent?: () => boolean;
};

/** Rejection from `renderPdf` when the load was superseded before it drew anything. */
export class PdfRenderSuperseded extends Error {
  constructor() {
    super("PDF render superseded");
    this.name = "PdfRenderSuperseded";
  }
}

export const PDF_SAVE_EVENT = "bugtext:pdf-save";
/** Toggles Edit PDF; the Reading View shortcut (⌘E) sends it for PDFs. */
export const PDF_EDIT_EVENT = "bugtext:pdf-edit";
export const PDF_ANNOTATIONS_EVENT = "bugtext:pdf-annotations";
export const PDF_COPY_QUOTE_EVENT = "bugtext:pdf-copy-quote";
export const PDF_SAVE_AS_EVENT = "bugtext:pdf-save-as";
/** Raised by the PDF toolbar's Find; the workbench opens its find bar. */
export const PDF_FIND_EVENT = "bugtext:pdf-find";
/** Raised by the PDF toolbar's zoom controls; `detail` is the command (zoom-in, fit-width, …). */
export const PDF_ZOOM_EVENT = "bugtext:pdf-zoom";

const RENDER_SCALE = 1.4;
// Upper bound on canvas pixels for one document (about 1 GB of RGBA). Pages are
// drawn only near the view, so the budget covers about this many pages at once.
const PDF_CANVAS_PIXEL_BUDGET = 256 * 1024 * 1024;
const PDF_LIVE_PAGE_ESTIMATE = 12;
// How far (CSS px) outside the view a page is drawn ahead of scrolling to it.
const PDF_DRAW_MARGIN = 1200;

/** Canvas pixels per CSS pixel: the display's ratio (max 2x), reduced to stay inside the budget. */
export function pdfOutputScale(
  devicePixelRatio: number,
  cssPixelsPerPage: number,
  pageCount: number,
): number {
  const ratio = Math.max(1, Math.min(devicePixelRatio || 1, 2));
  const cssPixels = Math.max(1, cssPixelsPerPage * pageCount);
  if (cssPixels * ratio * ratio <= PDF_CANVAS_PIXEL_BUDGET) return ratio;
  return Math.max(1, Math.sqrt(PDF_CANVAS_PIXEL_BUDGET / cssPixels));
}
/**
 * The page showing the most height between `top` and `bottom` (ties go to the
 * earlier page), or the nearest page when none is in view; -1 only without pages.
 */
export function mostVisiblePageIndex(
  pages: ReadonlyArray<{ top: number; bottom: number }>,
  top: number,
  bottom: number,
): number {
  let best = -1;
  let bestShown = Number.NEGATIVE_INFINITY;
  pages.forEach((page, index) => {
    // Negative when the page is out of view: minus its distance from the view.
    const shown = Math.min(page.bottom, bottom) - Math.max(page.top, top);
    if (shown > bestShown) {
      best = index;
      bestShown = shown;
    }
  });
  return best;
}
const PDF_EDIT_HISTORY_LIMIT = 80;
type PendingPdfImage = {
  name: string;
  mimeType: "image/png" | "image/jpeg";
  bytes: number[];
  width: number;
  height: number;
};

type PdfPageView = {
  element: HTMLElement;
  overlay: HTMLElement;
  text: string;
  box: PdfPageBox;
  /** Draws the page if needed; null when the draw was cancelled. */
  draw: () => Promise<HTMLCanvasElement | null>;
  /** Frees the page's canvas; it is drawn again when it comes back into view. */
  release: () => void;
  /** A small standalone rendering of the page, `width` pixels wide. */
  snapshot: (width: number) => Promise<HTMLCanvasElement | null>;
};

// Saving reads system fonts for text the standard PDF fonts cannot encode.
const loadSystemFontBytes: PdfFontBytesLoader = async (fontPath) => {
  try {
    return new Uint8Array(await invoke<number[]>("read_file_bytes", { path: fontPath }));
  } catch {
    return null;
  }
};

function operationRect(operation: PdfEditOperation): PdfRect {
  if (operation.type === "replacementText") return operation.text.rect;
  return operation.rect;
}

function operationText(operation: PdfEditOperation): string {
  if (operation.type === "textBox") return operation.text;
  if (operation.type === "replacementText") return operation.text.value;
  if (operation.type === "ocrTextBlock") return operation.text;
  if (operation.type === "directTextEdit") return operation.replacementText;
  if (operation.type === "imageBox") return operation.name;
  return "";
}

function operationLabel(operation: PdfEditOperation): string {
  if (operation.type === "coverPatch") return "Cover patch";
  if (operation.type === "replacementText") return operation.text.value;
  if (operation.type === "directTextEdit") return operation.replacementText;
  if (operation.type === "ocrTextBlock") {
    return `OCR ${Math.round(operation.confidence * 100)}%: ${operation.text}`;
  }
  if (operation.type === "imageBox") return `Image: ${operation.name}`;
  return operationText(operation);
}

function operationId(): string {
  return `pdf-edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function scaledRect(rect: PdfRect): Record<string, string> {
  return {
    left: `${rect.x * RENDER_SCALE}px`,
    top: `${rect.y * RENDER_SCALE}px`,
    width: `${rect.width * RENDER_SCALE}px`,
    height: `${rect.height * RENDER_SCALE}px`,
  };
}

// On-screen px per PDF unit. Derived from the live element size, not
// RENDER_SCALE, so preview zoom (CSS zoom on .pdf-document) keeps pointer
// math correct.
function pageScreenScale(pageElement: HTMLElement, page: PdfPageBox): number {
  const bounds = pageElement.getBoundingClientRect();
  return bounds.width > 0 ? bounds.width / page.width : RENDER_SCALE;
}

function rectFromPointer(
  event: MouseEvent,
  pageElement: HTMLElement,
  page: PdfPageBox,
  width: number,
  height: number,
): PdfRect {
  const bounds = pageElement.getBoundingClientRect();
  const scale = pageScreenScale(pageElement, page);
  const x = (event.clientX - bounds.left) / scale;
  const y = (event.clientY - bounds.top) / scale;
  return normalizePdfRect(
    { x, y, width, height },
    page,
  );
}

function imageMimeFromPath(path: string): "image/png" | "image/jpeg" | null {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || "Image";
}

function bytesToDataUrl(bytes: number[], mimeType: string): string {
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return `data:${mimeType};base64,${window.btoa(binary)}`;
}

function readImageDimensions(bytes: number[], mimeType: string): Promise<{
  width: number;
  height: number;
}> {
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeType }));
    const done = (size: { width: number; height: number }): void => {
      URL.revokeObjectURL(url);
      resolve(size);
    };
    image.onload = () => done({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => done({ width: 1, height: 1 });
    image.src = url;
  });
}

function moveOperation(
  operation: PdfEditOperation,
  page: PdfPageBox,
  dx: number,
  dy: number,
): PdfEditOperation {
  const moveRect = (rect: PdfRect): PdfRect =>
    normalizePdfRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, page);
  if (operation.type === "replacementText") {
    return {
      ...operation,
      cover: {
        ...operation.cover,
        rect: moveRect(operation.cover.rect),
        rects: operation.cover.rects?.map(moveRect),
      },
      text: {
        ...operation.text,
        rect: moveRect(operation.text.rect),
      },
    };
  }
  if (operation.type === "directTextEdit") {
    return {
      ...operation,
      rect: moveRect(operation.rect),
      fallbackCoverRects: operation.fallbackCoverRects?.map(moveRect),
    };
  }
  return {
    ...operation,
    rect: moveRect(operation.rect),
  };
}

function resizeOperation(
  operation: PdfEditOperation,
  page: PdfPageBox,
  dx: number,
  dy: number,
): PdfEditOperation {
  const grow = (rect: PdfRect): PdfRect =>
    normalizePdfRect(
      {
        ...rect,
        width: Math.max(12, rect.width + dx),
        height: Math.max(12, rect.height + dy),
      },
      page,
    );
  if (operation.type === "replacementText") {
    const rect = grow(operation.text.rect);
    return {
      ...operation,
      cover: { ...operation.cover, rect, rects: undefined },
      text: { ...operation.text, rect },
    };
  }
  if (operation.type === "directTextEdit") {
    return { ...operation, rect: grow(operation.rect), fallbackCoverRects: undefined };
  }
  return { ...operation, rect: grow(operation.rect) };
}

function snapOperation(operation: PdfEditOperation, page: PdfPageBox): PdfEditOperation {
  if (operation.type === "replacementText") {
    const rect = snapPdfRect(operation.text.rect, page);
    return {
      ...operation,
      cover: {
        ...operation.cover,
        rect,
        rects: operation.cover.rects?.map((item) => snapPdfRect(item, page)),
      },
      text: { ...operation.text, rect },
    };
  }
  if (operation.type === "directTextEdit") {
    return {
      ...operation,
      rect: snapPdfRect(operation.rect, page),
      fallbackCoverRects: operation.fallbackCoverRects?.map((rect) =>
        snapPdfRect(rect, page),
      ),
    };
  }
  return { ...operation, rect: snapPdfRect(operation.rect, page) };
}

export function clearPdfEditDraft(path: string): Promise<boolean> {
  return writePdfDraft(path, null);
}

/** True when unsaved edits for `path` are stored, so a tab can show them before it renders. */
export async function hasPdfEditDraft(path: string): Promise<boolean> {
  return hasPdfEdits(await loadDraft(path));
}

async function loadDraft(path: string): Promise<PdfEditDocument> {
  try {
    const raw = await readPdfDraft(path);
    if (!raw) return createPdfEditDocument(path);
    const parsed = parsePdfEditDocument(raw);
    return parsed.sourceFingerprint === path ? parsed : createPdfEditDocument(path);
  } catch {
    return createPdfEditDocument(path);
  }
}

/** Resolves false when the draft could not be kept. */
function storeDraft(path: string, edits: PdfEditDocument): Promise<boolean> {
  return writePdfDraft(path, hasPdfEdits(edits) ? serializePdfEditDocument(edits) : null);
}

function clonePdfEditDocument(edits: PdfEditDocument): PdfEditDocument {
  return parsePdfEditDocument(serializePdfEditDocument(edits));
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function drawPreviewRect(
  context: CanvasRenderingContext2D,
  rect: PdfRect,
  scale: number,
  color: string,
  opacity: number,
): void {
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, opacity));
  context.fillStyle = color;
  context.fillRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
  context.restore();
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawPreviewText(
  context: CanvasRenderingContext2D,
  rect: PdfRect,
  scale: number,
  text: string,
  style: typeof DEFAULT_PDF_TEXT_STYLE,
): void {
  const fontSize = Math.max(6, style.fontSize * scale);
  const lineHeight = fontSize * 1.25;
  const maxLines = Math.max(1, Math.floor((rect.height * scale) / lineHeight));
  const weight = style.bold ? "700" : "400";
  const fontStyle = style.italic ? "italic" : "normal";
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, style.opacity));
  context.fillStyle = style.color;
  context.font = `${fontStyle} ${weight} ${fontSize}px ${style.fontFamily}`;
  context.textBaseline = "top";
  context.textAlign = style.align;
  const lines = wrapCanvasText(context, text, rect.width * scale).slice(0, maxLines);
  const x =
    style.align === "center"
      ? (rect.x + rect.width / 2) * scale
      : style.align === "right"
        ? (rect.x + rect.width) * scale
        : rect.x * scale;
  const y = rect.y * scale;
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight, rect.width * scale);
  });
  context.restore();
}

function drawPreviewOperation(
  context: CanvasRenderingContext2D,
  operation: PdfEditOperation,
  scale: number,
): void {
  if (operation.type === "coverPatch") {
    drawPreviewRect(context, operation.rect, scale, operation.color, operation.opacity);
    return;
  }
  if (operation.type === "replacementText") {
    (operation.cover.rects ?? [operation.cover.rect]).forEach((rect) => {
      drawPreviewRect(context, rect, scale, operation.cover.color, operation.cover.opacity);
    });
    drawPreviewText(
      context,
      operation.text.rect,
      scale,
      operation.text.value,
      operation.text.style,
    );
    return;
  }
  if (operation.type === "directTextEdit") {
    (operation.fallbackCoverRects ?? [operation.rect]).forEach((rect) => {
      drawPreviewRect(context, rect, scale, "#ffffff", 1);
    });
    drawPreviewText(
      context,
      operation.rect,
      scale,
      operation.replacementText,
      operation.fallbackStyle ?? DEFAULT_PDF_TEXT_STYLE,
    );
    return;
  }
  if (operation.type === "textBox") {
    drawPreviewText(context, operation.rect, scale, operation.text, operation.style);
    return;
  }
  if (operation.type === "imageBox") {
    drawPreviewRect(context, operation.rect, scale, "#dce7ff", 0.85);
    drawPreviewText(
      context,
      operation.rect,
      scale,
      operation.name,
      { ...DEFAULT_PDF_TEXT_STYLE, color: "#244680", fontSize: 10, align: "center" },
    );
    return;
  }
  if (operation.type === "ocrTextBlock") {
    context.save();
    context.globalAlpha = 0.65;
    context.strokeStyle = "#4f8cff";
    context.setLineDash([3, 2]);
    context.strokeRect(
      operation.rect.x * scale,
      operation.rect.y * scale,
      operation.rect.width * scale,
      operation.rect.height * scale,
    );
    context.restore();
  }
}

function createReviewCanvasPair(
  source: HTMLCanvasElement,
  page: PdfPageBox,
  operations: PdfEditOperation[],
  width = 180,
): { before: HTMLCanvasElement; after: HTMLCanvasElement } {
  const scale = width / page.width;
  const height = Math.max(1, Math.round(page.height * scale));
  const makeCanvas = (): HTMLCanvasElement => {
    const canvas = source.ownerDocument.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const before = makeCanvas();
  const after = makeCanvas();
  before.getContext("2d")?.drawImage(source, 0, 0, width, height);
  const afterContext = after.getContext("2d");
  if (afterContext) {
    afterContext.drawImage(source, 0, 0, width, height);
    operations.forEach((operation) => drawPreviewOperation(afterContext, operation, scale));
  }
  return { before, after };
}

export async function renderPdf(
  host: HTMLElement,
  path: string,
  options?: PdfRenderOptions,
): Promise<PdfFindHandle> {
  const ensureCurrent = (): void => {
    if (options?.isCurrent && !options.isCurrent()) throw new PdfRenderSuperseded();
  };
  host.innerHTML = '<div class="pdf-loading">Loading PDF…</div>';
  installReadableStreamAsyncIterator();
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  ensureCurrent();
  const bytes = await invoke<number[]>("read_file_bytes", { path });
  const sourceDigest = await pdfSourceDigest(new Uint8Array(bytes));
  ensureCurrent();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
  });
  const document = await loadingTask.promise;
  const [{ AnnotationStore }, { createAnnotationLayer }, { createAnnotationController }, { createAnnotationsPanel }] = await Promise.all([
    import("./pdf-annotations/store"), import("./pdf-annotations/layer"),
    import("./pdf-annotations/controller"), import("./pdf-annotations/panel"),
  ]);
  const metadata = await document.getMetadata().catch(() => null);
  const pdfTitle = (metadata?.info as { Title?: unknown } | undefined)?.Title;
  const annotationTitle = typeof pdfTitle === "string" ? pdfTitle : "";
  const annotationBase = options?.folder ?? path.replace(/[/\\][^/\\]+$/, "");
  const annotationLayers: AnnotationLayer[] = [];
  let annotationNotice: HTMLElement | null = null;
  let annotationStore: AnnotationStore;
  let annotationPanel: ReturnType<typeof createPanelType> | null = null;
  const refreshAnnotations = (): void => {
    annotationPanel?.refresh();
    annotationLayers.forEach((layer) => layer.render(annotationStore.document.annotations));
    if (annotationNotice) annotationNotice.hidden = !annotationStore.changed;
  };
  annotationStore = await AnnotationStore.load(path, sourceDigest, document.numPages, refreshAnnotations);
  // Drafts are keyed by path; one made on different bytes may no longer line up.
  let editDocument: PdfEditDocument = await loadDraft(path);
  if (pdfDraftIsStale(editDocument, sourceDigest)) {
    const count = editDocument.pages.reduce((sum, page) => sum + page.operations.length, 0);
    const apply = await confirm(
      `This PDF changed after you made ${count} unsaved edit${count === 1 ? "" : "s"} to it. ` +
        "Apply them to the current file anyway? They may no longer line up with its content.",
      {
        title: "Unsaved PDF edits",
        kind: "warning",
        okLabel: "Apply Edits",
        cancelLabel: "Discard Edits",
      },
    );
    if (!apply) editDocument = createPdfEditDocument(path);
  }
  editDocument = { ...editDocument, sourceDigest };
  void storeDraft(path, editDocument);
  if (options?.isCurrent && !options.isCurrent()) {
    annotationStore.destroy();
    void loadingTask.destroy();
    throw new PdfRenderSuperseded();
  }
  host.innerHTML = "";
  let activeTool: PdfEditTool = "select";
  let selectedOperationId: string | null = null;
  let saving = false;
  let currentStyle = { ...DEFAULT_PDF_TEXT_STYLE };
  let currentCoverColor = "#ffffff";
  let currentCoverOpacity = 1;
  let snapEnabled = false;
  let pendingImage: PendingPdfImage | null = null;
  let pendingInlineEditId: string | null = null;
  // Text chosen for Replace Text, waiting for the replacement in the inspector.
  let pendingReplace: NonNullable<ReturnType<typeof selectionReplacement>> | null = null;
  let undoStack: PdfEditDocument[] = [];
  let redoStack: PdfEditDocument[] = [];
  let editing = false;
  let ocrBusy = false;
  let ocrLanguages: string[] = ["eng"];
  // The last recognition this view ran, for the OCR page.
  let ocrResult: { page: number; state: "running" | "done" | "empty" | "failed"; count: number } | null =
    null;
  let destroyed = false;
  let currentPage = 0;
  let zoomState: { zoom: number; fit: PdfFitMode | null } = { zoom: 1, fit: "auto" };
  const fontFamilySelect = window.document.createElement("select");
  const fontSizeInput = window.document.createElement("input");
  const boldButton = window.document.createElement("button");
  const italicButton = window.document.createElement("button");
  const alignSelect = window.document.createElement("select");
  const colorInput = window.document.createElement("input");
  const opacityInput = window.document.createElement("input");
  const coverColorInput = window.document.createElement("input");
  const coverOpacityInput = window.document.createElement("input");
  // Sticky statuses (save results/errors) survive the routine toolbar refresh,
  // which otherwise stomps them with "Unsaved PDF edits" immediately.
  let stickyStatus = false;
  const setStatus = (text: string, options: { sticky?: boolean } = {}): void => {
    status.textContent = text;
    stickyStatus = options.sticky ?? false;
  };
  const setTool = (tool: PdfEditTool): void => {
    activeTool = tool;
    container.dataset.pdfTool = tool;
    if (tool !== "replace" && inspector.page === "replace" && !pendingReplace) {
      inspector.close({ restoreFocus: false });
    }
    updateStyleBar();
    syncToolbar();
    setStatus(
      tool === "select"
        ? "Select or drag an edit"
        : tool === "text"
          ? "Click a page to add text"
          : tool === "cover"
            ? "Click a page to cover content"
            : tool === "replace"
              ? "Select the words you want to replace"
              : pendingImage
                ? `Click a page to place ${pendingImage.name}`
                : "Choose an image to place",
    );
  };
  const chooseImage = async (): Promise<void> => {
    const imagePath = await pickImagePath();
    if (!imagePath) return;
    const mimeType = imageMimeFromPath(imagePath);
    if (!mimeType) {
      setStatus("Choose a PNG or JPEG image");
      return;
    }
    const imageBytes = await invoke<number[]>("read_file_bytes", { path: imagePath });
    if (!imageBytes.length) {
      setStatus("The selected image is empty");
      return;
    }
    const dimensions = await readImageDimensions(imageBytes, mimeType);
    pendingImage = {
      name: basename(imagePath),
      mimeType,
      bytes: imageBytes,
      ...dimensions,
    };
    setTool("image");
  };
  fontFamilySelect.title = "Font family";
  fontFamilySelect.className = "pdf-edit-select pdf-edit-font-family";
  [
    ["Helvetica", "Helvetica"],
    ["Times Roman", "Times"],
    ["Courier", "Courier"],
  ].forEach(([label, value]) => {
    const option = window.document.createElement("option");
    option.textContent = label;
    option.value = value;
    fontFamilySelect.appendChild(option);
  });
  fontFamilySelect.value = currentStyle.fontFamily;
  fontSizeInput.type = "number";
  fontSizeInput.min = "6";
  fontSizeInput.max = "96";
  fontSizeInput.step = "1";
  fontSizeInput.value = String(currentStyle.fontSize);
  fontSizeInput.title = "Font size";
  fontSizeInput.className = "pdf-edit-number";
  boldButton.type = "button";
  boldButton.textContent = "B";
  boldButton.title = "Bold";
  italicButton.type = "button";
  italicButton.textContent = "I";
  italicButton.title = "Italic";
  alignSelect.title = "Text alignment";
  alignSelect.className = "pdf-edit-select pdf-edit-align";
  [
    ["Left", "left"],
    ["Center", "center"],
    ["Right", "right"],
  ].forEach(([label, value]) => {
    const option = window.document.createElement("option");
    option.textContent = label;
    option.value = value;
    alignSelect.appendChild(option);
  });
  alignSelect.value = currentStyle.align;
  // Text and covers each get their own color and opacity, so restyling the text of
  // a replacement never repaints the cover behind it.
  colorInput.type = "color";
  colorInput.value = currentStyle.color;
  colorInput.title = "Text color";
  opacityInput.type = "range";
  opacityInput.min = "0.05";
  opacityInput.max = "1";
  opacityInput.step = "0.05";
  opacityInput.value = String(currentStyle.opacity);
  opacityInput.title = "Text opacity";
  coverColorInput.type = "color";
  coverColorInput.value = currentCoverColor;
  coverColorInput.title = "Cover color";
  coverOpacityInput.type = "range";
  coverOpacityInput.min = "0.05";
  coverOpacityInput.max = "1";
  coverOpacityInput.step = "0.05";
  coverOpacityInput.value = "1";
  coverOpacityInput.title = "Cover opacity";
  // Style controls live in the inspector's Properties page for the selected edit.
  const textStyleGroup = window.document.createElement("div");
  textStyleGroup.className = "pdf-edit-style-group";
  textStyleGroup.setAttribute("aria-label", "Text style");
  textStyleGroup.append(
    fontFamilySelect,
    fontSizeInput,
    boldButton,
    italicButton,
    alignSelect,
    colorInput,
    opacityInput,
  );
  const coverStyleGroup = window.document.createElement("div");
  coverStyleGroup.className = "pdf-edit-style-group";
  coverStyleGroup.setAttribute("aria-label", "Cover style");
  coverStyleGroup.append(coverColorInput, coverOpacityInput);
  // Selecting an edit shows its Properties unless another page is in use (a
  // half-typed replacement or Review stays put); clearing the selection closes them.
  const updateStyleBar = (): void => {
    const operation = editing ? selectedOperation() : null;
    if (operation && (inspector.page === null || inspector.page === "properties")) {
      inspector.open("properties", { focus: false });
    } else if (!operation && inspector.page === "properties") {
      inspector.close({ restoreFocus: false });
    }
  };
  const container = window.document.createElement("div");
  container.className = "pdf-document";
  container.dataset.path = path;
  container.dataset.pdfMode = "read";
  const toolbar = createPdfToolbar(window.document, {
    onCommand: (command) => runToolbarCommand(command),
    onPageInput: (text) => {
      const result = parsePageInput(text, pages.length);
      if (!result.ok) {
        setStatus(result.message);
        return result.message;
      }
      setStatus("");
      goToPage(result.page);
      host.focus({ preventScroll: true });
      return null;
    },
    onPageReset: () => setStatus(""),
    onPress: (command) => {
      // The Actions menu takes two presses (open, then choose); keep the first capture.
      if (command === "actions-menu") cachedSelectionReplacement = selectionReplacement();
      else if (command === "replace-selection" || command === "tool:replace")
        cachedSelectionReplacement = selectionReplacement() ?? cachedSelectionReplacement;
    },
  });
  const status = toolbar.status;
  let shownPage: PdfInspectorPage | null = null;
  const inspector = createPdfInspector(window.document, {
    render: (page) => renderInspectorPage(page),
    onChange: () => {
      const was = shownPage;
      shownPage = inspector.page;
      if (was === "replace" && shownPage !== "replace" && pendingReplace) {
        pendingReplace = null;
        renderEditOverlays();
      }
      // Closing Properties by hand also lets go of the edit it showed.
      if (was === "properties" && shownPage === null && selectedOperationId) {
        setSelectedOperation(null);
      }
      container.dataset.inspector = inspector.page ? inspector.layout : "";
      syncToolbar();
      // The docked panel narrows the pages; refit while keeping the page in view.
      host.dispatchEvent(new CustomEvent(PDF_ZOOM_EVENT, { detail: "refit", bubbles: true }));
    },
  });
  host.append(toolbar.element, inspector.element, container);
  annotationNotice = window.document.createElement("div");
  annotationNotice.className = "pdf-annotation-notice";
  const noticeText = window.document.createElement("span");
  noticeText.textContent = "This PDF changed since it was annotated. Highlights may be out of place.";
  const keepButton = window.document.createElement("button");
  keepButton.type = "button"; keepButton.textContent = "Keep";
  keepButton.addEventListener("click", () => { void annotationStore.keepDigest().catch((error) => setStatus(String(error), { sticky: true })); });
  annotationNotice.append(noticeText, keepButton);
  annotationNotice.hidden = !annotationStore.changed;
  toolbar.element.append(annotationNotice);
  // Side panels sit just below the toolbar, whose height changes with Edit; the
  // inspector fills the rest of the pane and docks or floats by its width.
  const measureHost = (): void => {
    const toolbarHeight = toolbar.element.offsetHeight;
    host.style.setProperty("--pdf-toolbar-height", `${toolbarHeight}px`);
    host.style.setProperty("--pdf-view-h", `${Math.max(0, host.clientHeight - toolbarHeight)}px`);
    inspector.setHostWidth(host.clientWidth);
  };
  const toolbarSize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureHost);
  toolbarSize?.observe(toolbar.element);
  toolbarSize?.observe(host);
  const pages: PdfPageView[] = [];
  const textSignals: PdfPageTextSignal[] = [];
  const objectSignals: PdfPageObjectSignal[] = [];
  const fontSignals: PdfPageFontSignal[] = [];
  let thumbnailPanel: HTMLElement | null = null;
  let capabilitySummary: PdfCapabilitySummary | null = null;
  let matches: number[] = [];
  let active = -1;
  const selectedOperation = (): PdfEditOperation | null => {
    if (!selectedOperationId) return null;
    for (const page of editDocument.pages) {
      const found = page.operations.find((operation) => operation.id === selectedOperationId);
      if (found) return found;
    }
    return null;
  };
  const selectionReplacement = ():
    | {
        pageView: PdfPageView;
        sourceText: string;
        rect: PdfRect;
        coverRects: PdfRect[];
        style: typeof DEFAULT_PDF_TEXT_STYLE;
      }
    | null => {
    const selection = window.getSelection();
    const sourceText = selection?.toString().trim() ?? "";
    if (!selection || selection.rangeCount === 0 || !sourceText) return null;
    const range = selection.getRangeAt(0);
    const selectionRect = range.getBoundingClientRect();
    if (selectionRect.width <= 0 || selectionRect.height <= 0) return null;
    const node = range.commonAncestorContainer;
    const element =
      node.nodeType === window.Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    const centerX = selectionRect.left + selectionRect.width / 2;
    const centerY = selectionRect.top + selectionRect.height / 2;
    const pageView =
      pages.find((page) => element && page.element.contains(element)) ??
      pages.find((page) => {
        const bounds = page.element.getBoundingClientRect();
        return (
          centerX >= bounds.left &&
          centerX <= bounds.right &&
          centerY >= bounds.top &&
          centerY <= bounds.bottom
        );
      });
    if (!pageView) return null;
    const pageRect = pageView.element.getBoundingClientRect();
    const lineRects = Array.from(range.getClientRects());
    const textSpan = element?.closest?.(".pdf-text-layer span");
    const computed = textSpan ? window.getComputedStyle(textSpan) : null;
    const screenScale = pageScreenScale(pageView.element, pageView.box);
    const fontSize = estimatePdfFontSizeFromSelectionRects(
      lineRects,
      screenScale,
      currentStyle.fontSize,
    );
    return {
      pageView,
      sourceText,
      rect: pdfSelectionClientRectToPageRect(
        pageView.box,
        pageRect,
        selectionRect,
        screenScale,
      ),
      coverRects: pdfSelectionClientRectsToPageRects(
        pageView.box,
        pageRect,
        lineRects,
        screenScale,
      ),
      style: computed
        ? pdfTextStyleFromSelectionCss(
            {
              fontFamily: computed.fontFamily,
              fontStyle: computed.fontStyle,
              fontWeight: computed.fontWeight,
              color: computed.color,
            },
            fontSize,
            currentStyle,
          )
        : {
            ...currentStyle,
            fontSize,
          },
    };
  };
  let cachedSelectionReplacement: ReturnType<typeof selectionReplacement> = null;

  const setSelectedOperation = (id: string | null): void => {
    selectedOperationId = id;
    const operation = selectedOperation();
    const applyStyleControls = (style: typeof DEFAULT_PDF_TEXT_STYLE): void => {
      fontFamilySelect.value =
        ["Helvetica", "Times", "Courier"].includes(style.fontFamily)
          ? style.fontFamily
          : "Helvetica";
      fontSizeInput.value = String(style.fontSize);
      colorInput.value = style.color;
      opacityInput.value = String(style.opacity);
      boldButton.classList.toggle("active", style.bold);
      italicButton.classList.toggle("active", style.italic);
      alignSelect.value = style.align;
    };
    // Controls show the selected edit's style; with nothing selected (or for the
    // part an edit lacks) they show what the next new edit will use.
    const textStyle =
      operation?.type === "textBox"
        ? operation.style
        : operation?.type === "replacementText"
          ? operation.text.style
          : operation?.type === "directTextEdit"
            ? operation.fallbackStyle ?? DEFAULT_PDF_TEXT_STYLE
            : currentStyle;
    const cover =
      operation?.type === "replacementText"
        ? operation.cover
        : operation?.type === "coverPatch"
          ? operation
          : { color: currentCoverColor, opacity: currentCoverOpacity };
    applyStyleControls(textStyle);
    coverColorInput.value = cover.color;
    coverOpacityInput.value = String(cover.opacity);
    updateStyleBar();
    syncToolbar();
    container
      .querySelectorAll<HTMLElement>(".pdf-edit-item")
      .forEach((item) => item.classList.toggle("selected", item.dataset.editId === id));
  };
  const openPanel = (): PdfPanel | null =>
    inspector.page === "properties" ? null : inspector.page;
  const syncToolbar = (): void => {
    const operation = selectedOperation();
    const pending = editDocument.pages.reduce((sum, page) => sum + page.operations.length, 0);
    toolbar.update({
      page: currentPage,
      pageCount: pages.length,
      zoom: zoomState.zoom,
      fit: zoomState.fit,
      zoomLabel: pdfZoomLabel(zoomState.zoom, zoomState.fit),
      editing,
      tool: activeTool,
      saving,
      pending,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      hasSelectedEdit: Boolean(selectedOperationId),
      canReflow:
        operation?.type === "textBox" ||
        operation?.type === "replacementText" ||
        operation?.type === "directTextEdit" ||
        operation?.type === "ocrTextBlock",
      snap: snapEnabled,
      ocrBusy,
      ocrReview: summarizeOcrReview(listOcrReviewItems(editDocument)),
      proofIssues: pending ? listPdfProofIssues(editDocument).length : 0,
      pagesReady: pages.length > 0,
      support: capabilitySummary
        ? {
            limited:
              capabilitySummary.hasScannedPages ||
              capabilitySummary.directSimplePages < capabilitySummary.pages.length,
            note: pdfCapabilityMessage(capabilitySummary),
          }
        : null,
      pagesOpen: Boolean(thumbnailPanel),
      openPanel: openPanel(),
    });
  };
  const updateToolbarState = (): void => {
    syncToolbar();
    options?.onEditDirtyChange?.(hasPdfEdits(editDocument));
    if (hasPdfEdits(editDocument) && activeTool === "select" && !saving && !stickyStatus) {
      setStatus("Unsaved PDF edits");
    }
  };
  const keepDraft = (): void => {
    void storeDraft(path, editDocument).then((kept) => {
      if (kept) return;
      setStatus("Couldn't keep these edits if BugText closes. Save the PDF to keep them.", {
        sticky: true,
      });
    });
  };
  const applyEditDocument = (
    nextDocument: PdfEditDocument,
    options: { history?: boolean } = {},
  ): void => {
    const changed =
      serializePdfEditDocument(nextDocument) !== serializePdfEditDocument(editDocument);
    if (!changed) return;
    if (options.history !== false) {
      undoStack = [...undoStack, clonePdfEditDocument(editDocument)].slice(
        -PDF_EDIT_HISTORY_LIMIT,
      );
      redoStack = [];
    }
    editDocument = nextDocument;
    keepDraft();
  };
  const restoreEditDocument = (nextDocument: PdfEditDocument): void => {
    editDocument = clonePdfEditDocument(nextDocument);
    selectedOperationId = null;
    updateStyleBar();
    keepDraft();
    renderEditOverlays();
    refreshOcrReviewPanel();
    refreshProofPanel();
  };
  const commitTransientEdit = (before: PdfEditDocument): void => {
    const changed =
      serializePdfEditDocument(before) !== serializePdfEditDocument(editDocument);
    if (!changed) return;
    undoStack = [...undoStack, clonePdfEditDocument(before)].slice(
      -PDF_EDIT_HISTORY_LIMIT,
    );
    redoStack = [];
    updateToolbarState();
  };
  const snapIfNeeded = (page: PdfPageBox, operation: PdfEditOperation): PdfEditOperation =>
    snapEnabled ? snapOperation(operation, page) : operation;
  const replaceOperation = (
    page: PdfPageBox,
    operation: PdfEditOperation,
    options: { history?: boolean } = {},
  ): void => {
    applyEditDocument(
      addPdfEditOperation(
        removePdfEditOperation(editDocument, operation.id),
        page,
        snapIfNeeded(page, operation),
      ),
      options,
    );
  };
  const beginInlineTextEdit = (
    page: PdfPageBox,
    operation: PdfEditOperation,
    item: HTMLElement,
  ): void => {
    if (
      operation.type !== "textBox" &&
      operation.type !== "replacementText" &&
      operation.type !== "directTextEdit" &&
      operation.type !== "ocrTextBlock"
    ) {
      return;
    }
    setSelectedOperation(operation.id);
    setTool("select");
    const beforeEdit = clonePdfEditDocument(editDocument);
    item.contentEditable = "true";
    item.spellcheck = true;
    item.classList.add("editing");
    item.focus();
    const selection = window.getSelection();
    const range = window.document.createRange();
    range.selectNodeContents(item);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const textFromItem = (): string =>
      item.innerText.replace(/\u00a0/g, " ").replace(/\n$/, "");
    const onInput = (): void => {
      applyEditDocument(
        updatePdfEditOperationText(editDocument, page, operation.id, textFromItem()),
        { history: false },
      );
      updateToolbarState();
    };
    let cancelled = false;
    const finish = (): void => {
      item.removeEventListener("input", onInput);
      item.removeEventListener("blur", finish);
      item.removeEventListener("keydown", onKeyDown);
      item.contentEditable = "false";
      item.spellcheck = false;
      item.classList.remove("editing");
      // Esc puts the text back as it was before editing began; leaving any other way keeps it.
      if (cancelled) applyEditDocument(beforeEdit, { history: false });
      else commitTransientEdit(beforeEdit);
      renderEditOverlays();
      refreshOcrReviewPanel();
      refreshProofPanel();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelled = true;
        item.blur();
      }
    };
    item.addEventListener("input", onInput);
    item.addEventListener("blur", finish);
    item.addEventListener("keydown", onKeyDown);
  };
  const focusOperation = (id: string): void => {
    const page = editDocument.pages.find((item) =>
      item.operations.some((operation) => operation.id === id),
    );
    const pageView = pages.find((item) => item.box.page === page?.page);
    pageView?.element.scrollIntoView({ block: "center" });
    setTool("select");
    setSelectedOperation(id);
  };
  const focusPage = (pageNumber: number): void => {
    const pageView = pages.find((item) => item.box.page === pageNumber);
    if (!pageView) return;
    pageView.element.scrollIntoView({ block: "center" });
    pageView.element.classList.add("active");
    window.setTimeout(() => pageView.element.classList.remove("active"), 1000);
    if (capabilitySummary) {
      setStatus(pdfPageCapabilityMessage(capabilitySummary, pageNumber));
    }
  };
  const closeThumbnailPanel = (): void => {
    thumbnailPanel?.remove();
    thumbnailPanel = null;
    syncToolbar();
  };
  const renderThumbnailPanel = (): void => {
    if (!thumbnailPanel) return;
    thumbnailPanel.innerHTML = "";
    const header = window.document.createElement("header");
    const title = window.document.createElement("strong");
    title.textContent = "Pages";
    const meta = window.document.createElement("span");
    meta.textContent = `${pages.length} page${pages.length === 1 ? "" : "s"}`;
    const close = window.document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Close page thumbnails";
    close.addEventListener("click", closeThumbnailPanel);
    header.append(title, meta, close);
    thumbnailPanel.appendChild(header);

    const list = window.document.createElement("div");
    list.className = "pdf-thumbnail-list";
    const panel = thumbnailPanel;
    for (const pageView of pages) {
      const button = window.document.createElement("button");
      button.type = "button";
      button.className = "pdf-thumbnail";
      button.title = `Go to page ${pageView.box.page}`;
      button.addEventListener("click", () => focusPage(pageView.box.page));
      // A blank page-shaped canvas holds the place until the snapshot is ready.
      const canvas = window.document.createElement("canvas");
      canvas.width = 96;
      canvas.height = Math.max(1, Math.round((96 * pageView.box.height) / pageView.box.width));
      const label = window.document.createElement("span");
      label.textContent = String(pageView.box.page);
      button.append(canvas, label);
      list.appendChild(button);
      void pageView.snapshot(96).then((source) => {
        if (source && thumbnailPanel === panel) canvas.replaceWith(source);
      });
    }
    thumbnailPanel.appendChild(list);
  };
  const openThumbnailPanel = (): void => {
    if (thumbnailPanel) {
      closeThumbnailPanel();
      return;
    }
    thumbnailPanel = window.document.createElement("aside");
    thumbnailPanel.className = "pdf-thumbnail-panel";
    host.appendChild(thumbnailPanel);
    renderThumbnailPanel();
  };
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = "",
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = window.document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const field = (label: string, ...children: Node[]): HTMLElement => {
    const wrap = make("div", "pdf-ins-field");
    wrap.append(make("span", "pdf-ins-label", label), ...children);
    return wrap;
  };
  const callout = (text: string, tone: "plain" | "warn" = "plain"): HTMLElement =>
    make("p", `pdf-ins-callout ${tone}`, text);
  const actionButton = (
    label: string,
    onClick: () => void,
    tone: "" | "primary" | "danger" = "",
  ): HTMLButtonElement => {
    const button = make("button", `pdf-ins-btn ${tone}`.trim(), label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  };
  const pageBox = (page: number): PdfPageBox | undefined =>
    pages.find((item) => item.box.page === page)?.box;
  const isTextOperation = (operation: PdfEditOperation): boolean =>
    operation.type === "textBox" ||
    operation.type === "replacementText" ||
    operation.type === "directTextEdit" ||
    operation.type === "ocrTextBlock";
  // A text field that previews as you type and records one undo step on leaving.
  const liveTextArea = (
    value: string,
    onText: (text: string) => void,
    onFocus?: () => void,
  ): HTMLTextAreaElement => {
    const textarea = make("textarea");
    textarea.spellcheck = true;
    textarea.value = value;
    textarea.rows = Math.min(5, Math.max(2, value.split(/\r?\n/).length));
    let beforeTyping: PdfEditDocument | null = null;
    textarea.addEventListener("focus", () => {
      beforeTyping = clonePdfEditDocument(editDocument);
      onFocus?.();
    });
    textarea.addEventListener("input", () => onText(textarea.value));
    textarea.addEventListener("blur", () => {
      if (beforeTyping) commitTransientEdit(beforeTyping);
      beforeTyping = null;
    });
    return textarea;
  };

  const propertiesContent = (): PdfInspectorContent => {
    const operation = selectedOperation();
    if (!operation) {
      return { title: "Properties", body: [callout("Select an edit on the page.")] };
    }
    const kind =
      operation.type === "textBox"
        ? "Text box"
        : operation.type === "replacementText"
          ? "Visual replacement"
          : operation.type === "directTextEdit"
            ? "Direct replacement"
            : operation.type === "coverPatch"
              ? "Cover"
              : operation.type === "imageBox"
                ? "Image"
                : "OCR text";
    const body: Node[] = [];
    const original =
      operation.type === "replacementText"
        ? operation.sourceText
        : operation.type === "directTextEdit"
          ? operation.originalText
          : "";
    if (original) body.push(field("Original text", make("div", "pdf-ins-original", original)));
    if (operation.type === "directTextEdit") {
      body.push(
        callout(
          "Save tries to rewrite this text inside the PDF. If the page does not allow it, " +
            "Save places a visual replacement instead and tells you.",
        ),
      );
    }
    if (isTextOperation(operation)) {
      const textarea = liveTextArea(operationText(operation), (text) => {
        const page = pageBox(operation.page);
        if (!page) return;
        applyEditDocument(updatePdfEditOperationText(editDocument, page, operation.id, text), {
          history: false,
        });
        renderEditOverlays({ refreshProof: false });
      });
      textarea.setAttribute("aria-label", "Text");
      body.push(field("Text", textarea));
    }
    if (isTextOperation(operation) && operation.type !== "ocrTextBlock") {
      textStyleGroup.hidden = false;
      body.push(field("Text style", textStyleGroup));
    }
    if (operation.type === "coverPatch") {
      body.push(
        callout(
          "A cover is visual only. It hides content on the page, but the original text stays " +
            "in the file and can still be searched, copied or extracted. It is not redaction.",
          "warn",
        ),
      );
    }
    if (operation.type === "coverPatch" || operation.type === "replacementText") {
      coverStyleGroup.hidden = false;
      body.push(field("Cover", coverStyleGroup));
    }
    if (operation.type === "imageBox") body.push(field("File", make("div", "pdf-ins-original", operation.name)));
    const actions = make("div", "pdf-ins-actions");
    if (isTextOperation(operation)) actions.append(actionButton("Reflow", reflowSelected));
    actions.append(make("span", "pdf-ins-grow"), actionButton("Delete", deleteSelected, "danger"));
    body.push(actions);
    return { title: "Properties", sub: `${kind} · page ${operation.page}`, body };
  };

  const directAllowed = (page: number): boolean => {
    const entry = capabilitySummary?.pages.find((item) => item.page === page);
    return entry ? pdfCapabilityDetail(entry).directEditingSafe : false;
  };
  const replaceContent = (): PdfInspectorContent => {
    const pending = pendingReplace;
    if (!pending) {
      return {
        title: "Replace Text",
        body: [callout("Select the words on the page that you want to replace.")],
      };
    }
    const page = pending.pageView.box.page;
    const textarea = make("textarea", "pdf-ins-replace");
    textarea.spellcheck = true;
    textarea.value = pending.sourceText;
    textarea.rows = Math.min(5, Math.max(2, pending.sourceText.split(/\r?\n/).length));
    textarea.setAttribute("aria-label", "Replace with");
    const direct = directAllowed(page);
    const choice = (value: "visual" | "direct", label: string, note: string, disabled: boolean) => {
      const wrap = make("label", "pdf-ins-choice");
      const input = make("input");
      input.type = "radio";
      input.name = "pdf-replace-method";
      input.value = value;
      input.checked = value === "visual";
      input.disabled = disabled;
      wrap.append(input, make("b", "", label), make("small", "", note));
      return { wrap, input };
    };
    const visual = choice(
      "visual",
      "Visual replacement",
      "Covers the selected words and places your text on top. Always works.",
      false,
    );
    const rewrite = choice(
      "direct",
      "Try direct replacement",
      direct
        ? "Rewrites the text inside the PDF. If its font or layout does not allow it, Save " +
            "falls back to a visual replacement and tells you."
        : "Not available on this page: its text is too complex or it has no text layer.",
      !direct,
    );
    const apply = (): void => {
      const value = textarea.value.trim();
      if (!value) {
        textarea.focus();
        return;
      }
      applyReplacement(pending, value, rewrite.input.checked ? "direct" : "visual");
    };
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        apply();
      }
    });
    const actions = make("div", "pdf-ins-actions");
    actions.append(
      make("span", "pdf-ins-grow"),
      actionButton("Cancel", () => inspector.close()),
      actionButton("Apply", apply, "primary"),
    );
    return {
      title: "Replace Text",
      sub: `page ${page}`,
      body: [
        field("Original text", make("div", "pdf-ins-original", pending.sourceText)),
        field("Replace with", textarea),
        field("Method", visual.wrap, rewrite.wrap),
        actions,
      ],
    };
  };

  const supportContent = (): PdfInspectorContent => {
    if (!capabilitySummary) {
      return { title: "Editing Support", body: [callout("Checking pages…")] };
    }
    const list = make("div", "pdf-capability-list");
    for (const detail of pdfCapabilityDetails(capabilitySummary)) {
      const row = make("section", `pdf-capability-row ${detail.capability}`);
      const rowHeader = make("div");
      const focus = actionButton(`Page ${detail.page}`, () => focusPage(detail.page));
      rowHeader.append(
        focus,
        make("strong", "", detail.label),
        make("span", "", detail.directEditingSafe ? "Direct candidate" : "Fallback"),
      );
      row.append(rowHeader, make("p", "", detail.message));
      const objectSignal = objectSignals.find((signal) => signal.page === detail.page);
      const fontSignal = fontSignals.find((signal) => signal.page === detail.page);
      if (fontSignal) row.appendChild(make("p", "pdf-capability-fonts", pdfFontSignalMessage(fontSignal)));
      if (objectSignal) {
        row.appendChild(make("p", "pdf-capability-objects", pdfObjectSignalMessage(objectSignal)));
        if (objectSignal.objects.length) {
          const objectList = make("div", "pdf-capability-object-list");
          objectSignal.objects.forEach((object, index) => {
            const objectRow = make("div");
            const objectKind =
              object.type === "image"
                ? "Image"
                : object.type === "annotation"
                  ? object.label || "Annotation"
                  : "Vector";
            const focusObject = actionButton(`${objectKind} ${index + 1}`, () => {
              focusPage(object.page);
              setStatus(
                `Detected ${object.type} bounds: ${Math.round(object.rect.width)} x ${Math.round(object.rect.height)} pt`,
              );
            });
            focusObject.title = `Focus detected ${object.type} bounds`;
            const coverObject = actionButton("Cover", () => {
              const pageView = pages.find((item) => item.box.page === object.page);
              if (!pageView) return;
              applyEditDocument(
                addPdfEditOperation(editDocument, pageView.box, {
                  id: operationId(),
                  type: "coverPatch",
                  page: object.page,
                  rect: normalizePdfRect(object.rect, pageView.box),
                  color: currentCoverColor,
                  opacity: currentCoverOpacity,
                }),
              );
              renderEditOverlays();
              focusPage(object.page);
              setStatus(`Queued cover patch for detected ${object.type} ${index + 1}`);
            });
            coverObject.title = `Safely cover this detected ${object.type}; source-level object rewrites stay disabled for unsupported PDFs`;
            objectRow.append(focusObject, coverObject);
            objectList.appendChild(objectRow);
          });
          row.appendChild(objectList);
        }
      }
      list.appendChild(row);
    }
    return {
      title: "Editing Support",
      sub: pdfCapabilityMessage(capabilitySummary),
      body: [list],
    };
  };

  const reviewContent = (): PdfInspectorContent => {
    const editedPages = editDocument.pages.filter((page) => page.operations.length > 0);
    const list = make("div", "pdf-review-list");
    if (!editedPages.length) list.appendChild(make("p", "pdf-review-empty", "There are no pending PDF edits."));
    for (const page of editedPages) {
      const pageView = pages.find((item) => item.box.page === page.page);
      const row = make("section", "pdf-review-row");
      const rowHeader = make("div");
      rowHeader.append(
        actionButton(`Page ${page.page}`, () => focusPage(page.page)),
        make("span", "", `${page.operations.length} edit${page.operations.length === 1 ? "" : "s"}`),
      );
      row.appendChild(rowHeader);
      if (pageView) {
        const preview = make("div", "pdf-review-preview");
        row.appendChild(preview);
        void pageView.snapshot(180).then((source) => {
          if (!source) return;
          const pair = createReviewCanvasPair(source, pageView.box, page.operations);
          const beforeFigure = make("figure");
          beforeFigure.append(pair.before, make("figcaption", "", "Before"));
          const afterFigure = make("figure");
          afterFigure.append(pair.after, make("figcaption", "", "After"));
          preview.append(beforeFigure, afterFigure);
        });
      }
      const summary = make("ul", "pdf-review-summary");
      page.operations.forEach((operation) => {
        const item = make("li", "pdf-review-item");
        item.tabIndex = 0;
        item.textContent =
          operation.type === "directTextEdit"
            ? `Direct attempt (may save as a visual replacement): ${operation.replacementText}`
            : operation.type === "replacementText"
              ? `Replacement: ${operation.text.value}`
              : operation.type === "coverPatch"
                ? "Cover patch"
                : operation.type === "ocrTextBlock"
                  ? `OCR block ${Math.round(operation.confidence * 100)}%`
                  : operation.type === "imageBox"
                    ? `Image: ${operation.name}`
                    : `Text: ${operation.text}`;
        const select = (): void => focusOperation(operation.id);
        item.addEventListener("click", select);
        item.addEventListener("keydown", (event) => {
          if (event.key === "Enter") select();
        });
        summary.appendChild(item);
      });
      row.appendChild(summary);
      list.appendChild(row);
    }
    return {
      title: "Review Edits",
      sub: editedPages.length
        ? `${editedPages.length} edited page${editedPages.length === 1 ? "" : "s"}`
        : "No pending edits",
      body: [list],
    };
  };

  const proofContent = (): PdfInspectorContent => {
    const issues = listPdfProofIssues(editDocument);
    const list = make("div", "pdf-proof-list");
    if (!issues.length) {
      list.appendChild(make("p", "pdf-proof-empty", "No proofing suggestions for pending text edits."));
    }
    for (const issue of issues) {
      const row = make("section", "pdf-proof-row");
      const rowHeader = make("div");
      let suggestionText = issue.replacement;
      const apply = actionButton("Apply", () => {
        const page = pageBox(issue.page);
        if (!page) return;
        applyEditDocument(
          updatePdfEditOperationText(editDocument, page, issue.operationId, suggestionText),
        );
        renderEditOverlays();
        setStatus("Applied proofing suggestion");
      });
      rowHeader.append(
        actionButton(`Page ${issue.page}`, () => focusOperation(issue.operationId)),
        make("span", "", issue.message),
        apply,
      );
      // The page is not rebuilt while typing, so the box keeps focus.
      const textarea = liveTextArea(
        issue.replacement,
        (text) => {
          suggestionText = text;
          const page = pageBox(issue.page);
          if (!page) return;
          applyEditDocument(updatePdfEditOperationText(editDocument, page, issue.operationId, text), {
            history: false,
          });
          renderEditOverlays({ refreshProof: false });
        },
        () => focusOperation(issue.operationId),
      );
      const reflow = actionButton("Reflow", () => {
        const page = pageBox(issue.page);
        if (!page) return;
        applyEditDocument(reflowPdfEditOperationText(editDocument, page, issue.operationId));
        renderEditOverlays();
        setStatus("Reflowed PDF edit text");
      });
      row.append(rowHeader, textarea, reflow);
      list.appendChild(row);
    }
    return {
      title: "Check Text",
      sub: issues.length ? `${issues.length} suggestion${issues.length === 1 ? "" : "s"}` : "No suggestions",
      body: [list],
    };
  };

  const ocrReviewContent = (): PdfInspectorContent => {
    const items = listOcrReviewItems(editDocument);
    const summary = summarizeOcrReview(items);
    const list = make("div", "pdf-ocr-review-list");
    if (items.length === 0) {
      list.appendChild(make("p", "pdf-ocr-review-empty", "Recognize text on a page to create reviewable text blocks."));
    }
    for (const item of items) {
      const row = make("section", "pdf-ocr-review-row");
      row.classList.toggle("low-confidence", item.confidence < 0.75);
      row.dataset.editId = item.id;
      const rowHeader = make("div");
      rowHeader.append(
        actionButton(`Page ${item.page}`, () => focusOperation(item.id)),
        make("span", "", `${Math.round(item.confidence * 100)}%`),
        actionButton("Delete", () => {
          applyEditDocument(removeOcrReviewItem(editDocument, item.id));
          if (selectedOperationId === item.id) setSelectedOperation(null);
          renderEditOverlays();
          refreshOcrReviewPanel();
        }),
      );
      const textarea = liveTextArea(
        item.text,
        (text) => {
          applyEditDocument(updateOcrReviewText(editDocument, item.id, text), { history: false });
          renderEditOverlays();
        },
        () => focusOperation(item.id),
      );
      row.append(rowHeader, textarea);
      list.appendChild(row);
    }
    return {
      title: "OCR Review",
      sub:
        summary.total === 0
          ? "No blocks"
          : summary.lowConfidence > 0
            ? `${summary.lowConfidence} low confidence of ${summary.total}`
            : `${summary.total} reviewed blocks`,
      body: [list],
    };
  };

  const ocrContent = (): PdfInspectorContent => {
    const chips = make("div", "pdf-ins-chips");
    for (const language of OCR_LANGUAGES) {
      const on = ocrLanguages.includes(language.code);
      const chip = actionButton(language.label, () => {
        ocrLanguages = on
          ? ocrLanguages.filter((code) => code !== language.code)
          : [...ocrLanguages, language.code];
        inspector.refresh("ocr");
        // The page was rebuilt; keep focus on the same chip.
        inspector.element.querySelector<HTMLElement>(`[data-lang="${language.code}"]`)?.focus();
      });
      chip.dataset.lang = language.code;
      chip.classList.add("pdf-ins-chip");
      chip.setAttribute("aria-pressed", String(on));
      chip.disabled = ocrBusy;
      chips.appendChild(chip);
    }
    const body: Node[] = [
      field("Languages", chips),
      field("Scope", make("div", "pdf-ins-original", `Current page (${currentPage} of ${pages.length})`)),
    ];
    const result = ocrResult;
    if (result?.state === "running") {
      const state = make("p", "pdf-ins-callout", `Reading page ${result.page}… This runs on this Mac; nothing is uploaded.`);
      state.setAttribute("role", "status");
      body.push(state);
    } else if (result?.state === "done") {
      body.push(
        callout(
          result.count === 1
            ? `Added 1 text block to page ${result.page}. It is saved with your other edits; ` +
                "review it first if the scan is unclear."
            : `Added ${result.count} text blocks to page ${result.page}. They are saved with your ` +
                "other edits; review them first if the scan is unclear.",
        ),
      );
    } else if (result?.state === "empty") {
      body.push(callout(`No text found on page ${result.page}.`));
    } else if (result?.state === "failed") {
      body.push(callout(`Couldn't recognize text on page ${result.page}. Try again.`, "warn"));
    } else {
      body.push(
        callout(
          "Recognized text is added as an invisible layer so the page can be searched and " +
            "copied. It runs offline on this Mac.",
        ),
      );
    }
    if (!ocrLanguages.length) body.push(callout("Choose at least one language.", "warn"));
    const actions = make("div", "pdf-ins-actions");
    if (result?.state === "done") actions.append(actionButton("Review OCR Text", () => toggleInspector("ocr-review")));
    const run = actionButton(ocrBusy ? "Recognizing…" : "Recognize Page", runOcr, "primary");
    run.disabled = ocrBusy || !ocrLanguages.length || pages.length === 0;
    actions.append(make("span", "pdf-ins-grow"), run);
    body.push(actions);
    return { title: "Recognize Text", sub: "offline", body };
  };
  const renderInspectorPage = (page: PdfInspectorPage): PdfInspectorContent =>
    page === "annotations"
      ? { title: "Annotations", body: annotationPanel ? [annotationPanel.element] : [] }
      : page === "ocr"
      ? ocrContent()
      : page === "properties"
      ? propertiesContent()
      : page === "replace"
        ? replaceContent()
        : page === "support"
          ? supportContent()
          : page === "review"
            ? reviewContent()
            : page === "proof"
              ? proofContent()
              : ocrReviewContent();
  const refreshReviewPanel = (): void => inspector.refresh("review");
  const refreshProofPanel = (): void => inspector.refresh("proof");
  const refreshOcrReviewPanel = (): void => inspector.refresh("ocr-review");
  // Toolbar pages toggle; closing returns focus to the control that opened them.
  const toggleInspector = (page: Exclude<PdfPanel, "replace">): void => {
    if (inspector.page === page) {
      inspector.close();
      return;
    }
    inspector.open(page, { restoreFocus: () => toolbar.focusCommand(page) });
  };
  const updateSelectedStyle = (options: { history?: boolean } = {}): void => {
    const nextStyle = (base: typeof DEFAULT_PDF_TEXT_STYLE): typeof DEFAULT_PDF_TEXT_STYLE => ({
      ...base,
      fontFamily: fontFamilySelect.value,
      fontSize: Number(fontSizeInput.value) || base.fontSize,
      color: colorInput.value,
      opacity: Number(opacityInput.value) || base.opacity,
      bold: boldButton.classList.contains("active"),
      italic: italicButton.classList.contains("active"),
      align:
        alignSelect.value === "center" || alignSelect.value === "right"
          ? alignSelect.value
          : "left",
    });
    const selected = selectedOperation();
    if (!selected) {
      currentStyle = nextStyle(currentStyle);
      currentCoverColor = coverColorInput.value;
      currentCoverOpacity = Number(coverOpacityInput.value) || currentCoverOpacity;
      return;
    }
    const page = pages.find((item) => item.box.page === selected.page)?.box;
    if (!page) return;
    if (selected.type === "textBox") {
      replaceOperation(page, {
        ...selected,
        style: nextStyle(selected.style),
      }, options);
    } else if (selected.type === "replacementText") {
      replaceOperation(page, {
        ...selected,
        cover: {
          ...selected.cover,
          color: coverColorInput.value,
          opacity: Number(coverOpacityInput.value) || selected.cover.opacity,
        },
        text: {
          ...selected.text,
          style: nextStyle(selected.text.style),
        },
      }, options);
    } else if (selected.type === "coverPatch") {
      replaceOperation(page, {
        ...selected,
        color: coverColorInput.value,
        opacity: Number(coverOpacityInput.value) || selected.opacity,
      }, options);
    } else if (selected.type === "directTextEdit") {
      const style = selected.fallbackStyle ?? DEFAULT_PDF_TEXT_STYLE;
      replaceOperation(page, {
        ...selected,
        fallbackStyle: nextStyle(style),
      }, options);
    }
    renderEditOverlays();
  };
  fontFamilySelect.addEventListener("change", () => updateSelectedStyle());
  fontSizeInput.addEventListener("change", () => updateSelectedStyle());
  boldButton.addEventListener("click", () => {
    boldButton.classList.toggle("active");
    updateSelectedStyle();
  });
  italicButton.addEventListener("click", () => {
    italicButton.classList.toggle("active");
    updateSelectedStyle();
  });
  alignSelect.addEventListener("change", () => updateSelectedStyle());
  // Dragging the color or opacity control previews live and records one undo step.
  let styleEditBefore: PdfEditDocument | null = null;
  const previewSelectedStyle = (): void => {
    styleEditBefore = styleEditBefore ?? clonePdfEditDocument(editDocument);
    updateSelectedStyle({ history: false });
  };
  const commitSelectedStyle = (): void => {
    if (!styleEditBefore) return;
    const before = styleEditBefore;
    styleEditBefore = null;
    commitTransientEdit(before);
  };
  colorInput.addEventListener("input", previewSelectedStyle);
  colorInput.addEventListener("change", commitSelectedStyle);
  opacityInput.addEventListener("input", previewSelectedStyle);
  opacityInput.addEventListener("change", commitSelectedStyle);
  coverColorInput.addEventListener("input", previewSelectedStyle);
  coverColorInput.addEventListener("change", commitSelectedStyle);
  coverOpacityInput.addEventListener("input", previewSelectedStyle);
  coverOpacityInput.addEventListener("change", commitSelectedStyle);
  const renderEditOverlays = (options: { refreshProof?: boolean } = {}): void => {
    pages.forEach((pageView) => {
      pageView.overlay.innerHTML = "";
      if (pendingReplace?.pageView === pageView) {
        const rects = pendingReplace.coverRects.length ? pendingReplace.coverRects : [pendingReplace.rect];
        rects.forEach((rect) => {
          const mark = window.document.createElement("div");
          mark.className = "pdf-edit-pending";
          Object.assign(mark.style, scaledRect(rect));
          pageView.overlay.appendChild(mark);
        });
      }
      editDocument.pages
        .find((page) => page.page === pageView.box.page)
        ?.operations.forEach((operation) => {
          if (operation.type === "replacementText") {
            (operation.cover.rects ?? [operation.cover.rect]).forEach((rect) => {
              const cover = window.document.createElement("div");
              cover.className = "pdf-edit-item pdf-edit-cover";
              Object.assign(cover.style, scaledRect(rect));
              cover.style.background = operation.cover.color;
              cover.style.opacity = String(operation.cover.opacity);
              pageView.overlay.appendChild(cover);
            });
          }
          const item = window.document.createElement("div");
          item.className = `pdf-edit-item pdf-edit-${operation.type}`;
          item.dataset.editId = operation.id;
          item.tabIndex = 0;
          item.title = operationLabel(operation);
          Object.assign(item.style, scaledRect(operationRect(operation)));
          if (operation.type === "coverPatch") {
            item.style.background = operation.color;
            item.style.opacity = String(operation.opacity);
          } else if (operation.type === "imageBox") {
            const image = window.document.createElement("img");
            image.alt = operation.name;
            image.draggable = false;
            image.src = bytesToDataUrl(operation.bytes, operation.mimeType);
            item.appendChild(image);
          } else {
            const text =
              operation.type === "replacementText" ? operation.text.value : operationText(operation);
            const style =
              operation.type === "replacementText"
                ? operation.text.style
                : operation.type === "directTextEdit"
                  ? operation.fallbackStyle ?? DEFAULT_PDF_TEXT_STYLE
                : "style" in operation
                  ? operation.style
                  : DEFAULT_PDF_TEXT_STYLE;
            item.textContent = text;
            item.style.color = style.color;
            item.style.fontFamily = style.fontFamily;
            item.style.fontSize = `${style.fontSize * RENDER_SCALE}px`;
            item.style.fontWeight = style.bold ? "700" : "400";
            item.style.fontStyle = style.italic ? "italic" : "normal";
            item.style.textAlign = style.align;
            item.style.opacity = String(style.opacity);
            if (operation.type === "ocrTextBlock") {
              item.style.color = "var(--accent)";
              item.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)";
              item.style.opacity = "0.38";
            }
          }
          const handle = window.document.createElement("span");
          handle.className = "pdf-edit-resize";
          handle.contentEditable = "false";
          handle.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedOperation(operation.id);
            const startX = event.clientX;
            const startY = event.clientY;
            const dragScale = pageScreenScale(pageView.element, pageView.box);
            const original = selectedOperation();
            if (!original) return;
            const beforeDrag = clonePdfEditDocument(editDocument);
            const onMove = (moveEvent: PointerEvent): void => {
              const dx = (moveEvent.clientX - startX) / dragScale;
              const dy = (moveEvent.clientY - startY) / dragScale;
              replaceOperation(
                pageView.box,
                resizeOperation(original, pageView.box, dx, dy),
                { history: false },
              );
              renderEditOverlays();
            };
            const onUp = (): void => {
              window.document.removeEventListener("pointermove", onMove);
              window.document.removeEventListener("pointerup", onUp);
              commitTransientEdit(beforeDrag);
            };
            window.document.addEventListener("pointermove", onMove);
            window.document.addEventListener("pointerup", onUp, { once: true });
          });
          item.appendChild(handle);
          item.classList.toggle("selected", operation.id === selectedOperationId);
          item.addEventListener("click", (event) => {
            event.stopPropagation();
            setSelectedOperation(operation.id);
            setTool("select");
            // Keep keyboard focus on the edit so Delete, Cmd+Z and tool keys reach the view.
            item.focus({ preventScroll: true });
          });
          item.addEventListener("dblclick", (event) => {
            event.stopPropagation();
            const current = selectedOperation();
            if (!current) return;
            beginInlineTextEdit(pageView.box, current, item);
          });
          item.addEventListener("pointerdown", (event) => {
            if (activeTool !== "select") return;
            if (item.isContentEditable) return;
            event.preventDefault();
            event.stopPropagation();
            item.focus({ preventScroll: true });
            setSelectedOperation(operation.id);
            const startX = event.clientX;
            const startY = event.clientY;
            const dragScale = pageScreenScale(pageView.element, pageView.box);
            const original = selectedOperation();
            if (!original) return;
            const beforeDrag = clonePdfEditDocument(editDocument);
            const onMove = (moveEvent: PointerEvent): void => {
              const dx = (moveEvent.clientX - startX) / dragScale;
              const dy = (moveEvent.clientY - startY) / dragScale;
              replaceOperation(
                pageView.box,
                moveOperation(original, pageView.box, dx, dy),
                { history: false },
              );
              renderEditOverlays();
            };
            const onUp = (): void => {
              window.document.removeEventListener("pointermove", onMove);
              window.document.removeEventListener("pointerup", onUp);
              commitTransientEdit(beforeDrag);
            };
            window.document.addEventListener("pointermove", onMove);
            window.document.addEventListener("pointerup", onUp, { once: true });
          });
          pageView.overlay.appendChild(item);
          if (pendingInlineEditId === operation.id) {
            pendingInlineEditId = null;
            window.requestAnimationFrame(() => beginInlineTextEdit(pageView.box, operation, item));
          }
        });
    });
    updateToolbarState();
    refreshReviewPanel();
    if (options.refreshProof !== false) refreshProofPanel();
  };
  const addOperationAt = (pageView: PdfPageView, event: MouseEvent): void => {
    if (activeTool === "select") {
      setSelectedOperation(null);
      return;
    }
    if (activeTool === "text") {
      const operation: PdfEditOperation = {
        id: operationId(),
        type: "textBox",
        page: pageView.box.page,
        rect: rectFromPointer(event, pageView.element, pageView.box, 170, 34),
        text: "Text",
        style: currentStyle,
      };
      applyEditDocument(
        addPdfEditOperation(
          editDocument,
          pageView.box,
          snapIfNeeded(pageView.box, operation),
        ),
      );
      selectedOperationId = operation.id;
      pendingInlineEditId = operation.id;
    } else if (activeTool === "cover") {
      applyEditDocument(
        addPdfEditOperation(
          editDocument,
          pageView.box,
          snapIfNeeded(pageView.box, {
            id: operationId(),
            type: "coverPatch",
            page: pageView.box.page,
            rect: rectFromPointer(event, pageView.element, pageView.box, 170, 28),
            color: currentCoverColor,
            opacity: currentCoverOpacity,
          }),
        ),
      );
    } else if (activeTool === "replace") {
      // Replace Text works from a text selection, captured on mouseup.
      return;
    } else if (activeTool === "image") {
      if (!pendingImage) {
        setStatus("Choose an image first");
        return;
      }
      const aspect = pendingImage.width / Math.max(1, pendingImage.height);
      const width = Math.min(220, pageView.box.width * 0.45);
      const height = Math.max(24, width / Math.max(0.1, aspect));
      applyEditDocument(
        addPdfEditOperation(
          editDocument,
          pageView.box,
          snapIfNeeded(pageView.box, {
            id: operationId(),
            type: "imageBox",
            page: pageView.box.page,
            rect: rectFromPointer(event, pageView.element, pageView.box, width, height),
            name: pendingImage.name,
            mimeType: pendingImage.mimeType,
            bytes: pendingImage.bytes,
          }),
        ),
      );
      pendingImage = null;
    }
    setTool("select");
    renderEditOverlays();
  };
  const deleteSelected = (): void => {
    if (!selectedOperationId) return;
    applyEditDocument(removePdfEditOperation(editDocument, selectedOperationId));
    setSelectedOperation(null);
    renderEditOverlays();
    refreshOcrReviewPanel();
  };
  const undoPdfEdit = (): void => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    redoStack = [...redoStack, clonePdfEditDocument(editDocument)].slice(
      -PDF_EDIT_HISTORY_LIMIT,
    );
    undoStack = undoStack.slice(0, -1);
    restoreEditDocument(previous);
    setStatus("Undid PDF edit");
  };
  const redoPdfEdit = (): void => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    undoStack = [...undoStack, clonePdfEditDocument(editDocument)].slice(
      -PDF_EDIT_HISTORY_LIMIT,
    );
    redoStack = redoStack.slice(0, -1);
    restoreEditDocument(next);
    setStatus("Redid PDF edit");
  };
  const toggleSnap = (): void => {
    snapEnabled = !snapEnabled;
    syncToolbar();
    setStatus(snapEnabled ? "Snap enabled" : "Snap disabled");
  };
  const applyReplacement = (
    pending: NonNullable<typeof pendingReplace>,
    value: string,
    method: "visual" | "direct",
  ): void => {
    const page = pending.pageView.box;
    const coverRects = pending.coverRects.length ? pending.coverRects : undefined;
    const operation: PdfEditOperation =
      method === "direct"
        ? {
            id: operationId(),
            type: "directTextEdit",
            page: page.page,
            sourceId: `page-${page.page}-selection`,
            originalText: pending.sourceText,
            replacementText: value,
            rect: pending.rect,
            fallbackCoverRects: coverRects,
            fallbackStyle: pending.style,
          }
        : {
            id: operationId(),
            type: "replacementText",
            page: page.page,
            sourceText: pending.sourceText,
            cover: {
              rect: pending.rect,
              rects: coverRects,
              color: currentCoverColor,
              opacity: currentCoverOpacity,
            },
            text: { rect: pending.rect, value, style: pending.style },
          };
    applyEditDocument(addPdfEditOperation(editDocument, page, snapIfNeeded(page, operation)));
    pendingReplace = null;
    inspector.close({ restoreFocus: false });
    setTool("select");
    renderEditOverlays();
    setSelectedOperation(operation.id);
    host.focus({ preventScroll: true });
    setStatus(
      method === "direct"
        ? `Queued a direct replacement on page ${page.page}. Save falls back to a visual replacement if needed.`
        : `Queued a replacement on page ${page.page}`,
    );
  };
  // Replace Text starts from selected words; without them the inspector asks for a selection.
  const beginReplace = (): void => {
    const selection = cachedSelectionReplacement ?? selectionReplacement();
    cachedSelectionReplacement = null;
    if (activeTool !== "replace") setTool("replace");
    if (selection) {
      pendingReplace = selection;
      window.getSelection()?.removeAllRanges();
      renderEditOverlays();
    }
    const restoreFocus = (): void => toolbar.focusCommand("tool:replace");
    if (inspector.page === "replace") inspector.refresh("replace");
    else inspector.open("replace", { focus: false, restoreFocus });
    inspector.element.querySelector<HTMLTextAreaElement>(".pdf-ins-replace")?.focus();
    inspector.element.querySelector<HTMLTextAreaElement>(".pdf-ins-replace")?.select();
  };
  const onReplaceMouseUp = (): void => {
    if (!editing || activeTool !== "replace") return;
    // Let the browser settle the selection before reading it.
    window.setTimeout(() => {
      if (editing && activeTool === "replace" && selectionReplacement()) beginReplace();
    }, 0);
  };
  container.addEventListener("mouseup", onReplaceMouseUp);
  // A drawer covers the pages; pressing on them puts it away.
  const onDrawerOutside = (): void => {
    if (inspector.page && inspector.layout === "drawer") inspector.close({ restoreFocus: false });
  };
  container.addEventListener("pointerdown", onDrawerOutside);
  const reflowSelected = (): void => {
    const selected = selectedOperation();
    if (!selected) return;
    const page = pages.find((item) => item.box.page === selected.page)?.box;
    if (!page) return;
    applyEditDocument(reflowPdfEditOperationText(editDocument, page, selected.id));
    renderEditOverlays();
    setStatus("Reflowed selected PDF edit text");
  };
  const visiblePage = (): PdfPageView | null => {
    const index = mostVisiblePageIndex(
      pages.map((page) => page.element.getBoundingClientRect()),
      toolbar.element.getBoundingClientRect().bottom,
      window.innerHeight,
    );
    return index < 0 ? null : pages[index];
  };
  // Recognizes the page in view, offline. One job at a time; a result that
  // arrives after this view is gone is dropped.
  const runOcr = (): void => {
    const language = bundledOcrLanguage(ocrLanguages);
    if (ocrBusy || !language) return;
    void (async () => {
      const page = visiblePage();
      const canvas = await page?.draw();
      if (!page || !canvas || destroyed) return;
      const pageNumber = page.box.page;
      ocrBusy = true;
      ocrResult = { page: pageNumber, state: "running", count: 0 };
      syncToolbar();
      inspector.refresh("ocr");
      setStatus(`Recognizing text on page ${pageNumber}…`);
      try {
        const operations = await recognizePdfPageCanvas(canvas, page.box, language);
        if (destroyed) return;
        if (!operations.length) {
          ocrResult = { page: pageNumber, state: "empty", count: 0 };
          setStatus(`No text found on page ${pageNumber}`);
          return;
        }
        let nextDocument = editDocument;
        operations.forEach((operation) => {
          nextDocument = addPdfEditOperation(nextDocument, page.box, operation);
        });
        applyEditDocument(nextDocument);
        renderEditOverlays();
        refreshOcrReviewPanel();
        ocrResult = { page: pageNumber, state: "done", count: operations.length };
        setStatus(`Added a text layer to page ${pageNumber}`);
      } catch (error) {
        if (destroyed) return;
        console.error("PDF OCR failed", error);
        ocrResult = { page: pageNumber, state: "failed", count: 0 };
        setStatus(`Couldn't recognize text on page ${pageNumber}`);
      } finally {
        if (!destroyed) {
          ocrBusy = false;
          updateToolbarState();
          inspector.refresh("ocr");
        }
      }
    })();
  };
  const setCurrentPage = (page: number): void => {
    if (page === currentPage) return;
    currentPage = page;
    syncToolbar();
    if (!ocrBusy) inspector.refresh("ocr");
    options?.onPageChange?.(page, pages.length);
  };
  const goToPage = (page: number): void => {
    const view = pages[page - 1];
    if (!view) return;
    // Land the page top just below the sticky toolbar, whatever the zoom.
    const gap = 12;
    host.scrollTop +=
      view.element.getBoundingClientRect().top - toolbar.element.getBoundingClientRect().bottom - gap;
    setCurrentPage(page);
  };
  // The page field follows scrolling, measured once per frame.
  let pageFrame = 0;
  const trackPage = (): void => {
    pageFrame = 0;
    const view = visiblePage();
    if (view) setCurrentPage(view.box.page);
  };
  const schedulePageTrack = (): void => {
    if (typeof requestAnimationFrame === "undefined") return;
    if (!pageFrame) pageFrame = requestAnimationFrame(trackPage);
  };
  host.addEventListener("scroll", schedulePageTrack, { passive: true });
  const setEditing = (next: boolean): void => {
    if (editing === next) return;
    editing = next;
    container.dataset.pdfMode = next ? "edit" : "read";
    if (!next) {
      // Leaving Edit keeps every pending edit and the undo history; only tools reset.
      if (inspector.page === "replace") inspector.close({ restoreFocus: false });
      setSelectedOperation(null);
      setTool("select");
    }
    updateStyleBar();
    syncToolbar();
    setStatus(next ? "Select or drag an edit" : hasPdfEdits(editDocument) ? "Unsaved PDF edits" : "");
  };
  const runToolbarCommand = (command: PdfToolbarCommand): void => {
    if (command.startsWith("tool:")) {
      const tool = command.slice(5) as PdfEditTool;
      if (tool === "image") void chooseImage();
      else if (tool === "replace") beginReplace();
      else setTool(tool);
      return;
    }
    if (command.startsWith("zoom-") || command.startsWith("fit-")) {
      host.dispatchEvent(new CustomEvent(PDF_ZOOM_EVENT, { detail: command, bubbles: true }));
      return;
    }
    const actions: Record<string, () => void> = {
      annotations: () => toggleInspector("annotations"),
      pages: openThumbnailPanel,
      "page-prev": () => goToPage(currentPage - 1),
      "page-next": () => goToPage(currentPage + 1),
      find: () => host.dispatchEvent(new Event(PDF_FIND_EVENT, { bubbles: true })),
      edit: () => setEditing(!editing),
      save: () => void saveEditedPdf(),
      "save-copy": () => void saveEditedPdfAs(),
      ocr: () => toggleInspector("ocr"),
      "ocr-review": () => toggleInspector("ocr-review"),
      proof: () => toggleInspector("proof"),
      support: () => toggleInspector("support"),
      "replace-selection": beginReplace,
      reflow: reflowSelected,
      snap: toggleSnap,
      delete: deleteSelected,
      undo: undoPdfEdit,
      redo: redoPdfEdit,
      review: () => toggleInspector("review"),
    };
    actions[command]?.();
    syncToolbar();
  };
  // Escape closes one surface at a time: the inspector before Pages, returning
  // focus to the control that opened it. Closing Properties also deselects.
  const closeTopPanel = (): boolean => {
    if (inspector.close()) return true;
    if (!thumbnailPanel) return false;
    closeThumbnailPanel();
    toolbar.focusCommand("pages");
    return true;
  };
  const keyHandler = (event: KeyboardEvent): void => {
    if (isTextEntryTarget(event.target)) return;
    // The inspector handles its own keys; its buttons must not delete the edit.
    if (inspector.element.contains(event.target as HTMLElement)) return;
    if (event.key === "Escape" && (toolbar.closeMenu() || closeTopPanel())) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redoPdfEdit();
      } else {
        undoPdfEdit();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoPdfEdit();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedOperationId) {
      event.preventDefault();
      deleteSelected();
      return;
    }
    // Single letters pick an edit tool while editing.
    const tool = editing && !event.metaKey && !event.ctrlKey && !event.altKey ? toolForKey(event.key) : null;
    if (tool) {
      event.preventDefault();
      runToolbarCommand(`tool:${tool}`);
    }
  };
  host.addEventListener("keydown", keyHandler);
  // Tells the person when a direct replacement could not be written directly.
  const reportFallback = async (fallback: number): Promise<void> => {
    if (!fallback) return;
    await message(
      fallback === 1
        ? "One direct replacement couldn't be written into the PDF's own text, so it was " +
            "saved as a visual replacement (covered and retyped) instead."
        : `${fallback} direct replacements couldn't be written into the PDF's own text, so ` +
            "they were saved as visual replacements (covered and retyped) instead.",
      { title: "Saved with visual replacements", kind: "info" },
    );
  };
  // One save at a time, held across the confirmation and file dialogs too.
  let saveBusy = false;
  const withSaveLock = async (run: () => Promise<void>): Promise<void> => {
    if (saveBusy || saving) return;
    saveBusy = true;
    try {
      await run();
    } finally {
      saveBusy = false;
    }
  };
  const saveToSource = async (): Promise<void> => {
    if (!hasPdfEdits(editDocument)) return;
    let onDisk: Uint8Array;
    try {
      onDisk = new Uint8Array(await invoke<number[]>("read_file_bytes", { path }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), { sticky: true });
      return;
    }
    // Edits are written onto the bytes this view opened; say so if the file moved on.
    const changedOnDisk = (await pdfSourceDigest(onDisk)) !== sourceDigest;
    const overwrite = await confirm(
      changedOnDisk
        ? "This PDF changed on disk after BugText opened it. Saving puts your edits on the " +
            "version you opened and replaces the newer file (BugText backs it up first). Save anyway?"
        : "Save these edits into the original PDF? BugText will create a backup copy first.",
      {
        title: "Save edited PDF",
        kind: "warning",
        okLabel: changedOnDisk ? "Save Anyway" : "Save",
        cancelLabel: "Cancel",
      },
    );
    if (!overwrite) {
      if (changedOnDisk) {
        setStatus("Not saved: the PDF changed on disk. Save a Copy keeps both versions.", {
          sticky: true,
        });
      }
      return;
    }
    saving = true;
    updateToolbarState();
    try {
      setStatus("Saving PDF history snapshot...");
      await manualBinarySnapshot(path, onDisk, "Before PDF edit overwrite");
      setStatus("Backing up original PDF...");
      const backupPath = await invoke<string>("backup_file", { path });
      setStatus("Saving edited PDF...");
      const { writeEditedPdfWithReport } = await import("./pdf-edit-writer");
      const written = await writeEditedPdfWithReport(
        new Uint8Array(bytes),
        editDocument,
        loadSystemFontBytes,
      );
      await invoke("save_bytes", { path, bytes: Array.from(written.bytes) });
      editDocument = createPdfEditDocument(path);
      undoStack = [];
      redoStack = [];
      selectedOperationId = null;
      void storeDraft(path, editDocument);
      inspector.close({ restoreFocus: false });
      closeThumbnailPanel();
      options?.onEditDirtyChange?.(false);
      setStatus(`Saved. Backup: ${backupPath}`);
      await reportFallback(written.directFallback);
      options?.onReloadRequest?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), { sticky: true });
    } finally {
      saving = false;
      updateToolbarState();
    }
  };
  // Writes a separate copy; the open file, its pending edits and history stay put.
  const saveCopy = async (): Promise<void> => {
    const out = await pickExportPath("pdf");
    if (!out) return;
    // Choosing the open file itself goes through Save Changes, with its backup and
    // changed-on-disk checks; identity is resolved natively (aliases, symlinks).
    if (await invoke<boolean>("same_file", { a: path, b: out }).catch(() => out === path)) {
      if (hasPdfEdits(editDocument)) await saveToSource();
      else setStatus("That is the open PDF, which has no unsaved changes.", { sticky: true });
      return;
    }
    saving = true;
    updateToolbarState();
    try {
      const edited = hasPdfEdits(editDocument);
      let output: Uint8Array = new Uint8Array(bytes);
      let fallback = 0;
      if (edited) {
        setStatus("Saving edited PDF copy...");
        const { writeEditedPdfWithReport } = await import("./pdf-edit-writer");
        const written = await writeEditedPdfWithReport(output, editDocument, loadSystemFontBytes);
        output = written.bytes;
        fallback = written.directFallback;
      }
      await invoke("save_bytes", { path: out, bytes: Array.from(output) });
      setStatus(edited ? "Edited copy saved" : "Copy saved", { sticky: true });
      await reportFallback(fallback);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), { sticky: true });
    } finally {
      saving = false;
      updateToolbarState();
    }
  };
  const saveEditedPdf = (): Promise<void> => withSaveLock(saveToSource);
  const saveEditedPdfAs = (): Promise<void> => withSaveLock(saveCopy);
  // Another app changed the file: reload a clean view; with unsaved edits, offer a
  // reload (which asks whether to keep them) instead of drawing over new content.
  let diskNotice: HTMLElement | null = null;
  // Checks run every few seconds, so bytes are only re-read when the stat moves.
  const fileStamp = async (): Promise<string | null> => {
    try {
      const stat = await invoke<{ mtimeMs: number; size: number }>("file_stat", { path });
      return `${stat.mtimeMs}:${stat.size}`;
    } catch {
      return null;
    }
  };
  let checkedStamp = await fileStamp();
  const checkDisk = async (): Promise<void> => {
    if (saving || diskNotice) return;
    const stamp = await fileStamp();
    if (!stamp || stamp === checkedStamp) return;
    checkedStamp = stamp;
    let onDisk: Uint8Array;
    try {
      onDisk = new Uint8Array(await invoke<number[]>("read_file_bytes", { path }));
    } catch {
      return;
    }
    if (saving || diskNotice || (await pdfSourceDigest(onDisk)) === sourceDigest) return;
    if (!hasPdfEdits(editDocument)) {
      options?.onReloadRequest?.();
      return;
    }
    diskNotice = window.document.createElement("div");
    diskNotice.className = "pdf-disk-notice";
    diskNotice.setAttribute("role", "status");
    const message = window.document.createElement("span");
    message.textContent = "This PDF changed on disk.";
    const reload = window.document.createElement("button");
    reload.type = "button";
    reload.textContent = "Reload";
    reload.addEventListener("click", () => options?.onReloadRequest?.());
    const keep = window.document.createElement("button");
    keep.type = "button";
    keep.textContent = "Keep Editing";
    keep.title = "Keep editing the version you opened; Save will ask before replacing the newer file";
    keep.addEventListener("click", () => diskNotice?.remove());
    diskNotice.append(message, reload, keep);
    toolbar.element.after(diskNotice);
  };
  const onMenuSave = (): void => {
    void saveEditedPdf();
  };
  const onMenuSaveAs = (): void => {
    void saveEditedPdfAs();
  };
  const onMenuEdit = (): void => setEditing(!editing);
  host.addEventListener(PDF_EDIT_EVENT, onMenuEdit);
  host.addEventListener(PDF_SAVE_EVENT, onMenuSave);
  host.addEventListener(PDF_SAVE_AS_EVENT, onMenuSaveAs);
  setTool("select");

  let outputScale = 1;
  // Only pages near the view keep a canvas. Measured on scroll rather than with
  // IntersectionObserver, which WebKit misjudges under the zoom applied to pages.
  const lazyDraw = typeof requestAnimationFrame !== "undefined" && typeof ResizeObserver !== "undefined";
  let drawFrame = 0;
  const updateDrawnPages = (): void => {
    drawFrame = 0;
    const top = -PDF_DRAW_MARGIN;
    const bottom = window.innerHeight + PDF_DRAW_MARGIN;
    for (const view of pages) {
      const bounds = view.element.getBoundingClientRect();
      if (bounds.bottom >= top && bounds.top <= bottom) void view.draw();
      else view.release();
    }
  };
  const scheduleDrawnPages = (): void => {
    if (!drawFrame) drawFrame = requestAnimationFrame(updateDrawnPages);
  };
  const documentSize = lazyDraw ? new ResizeObserver(scheduleDrawnPages) : null;
  if (lazyDraw) {
    // Capture catches scrolling in whichever ancestor pane scrolls.
    window.addEventListener("scroll", scheduleDrawnPages, { capture: true, passive: true });
    window.addEventListener("resize", scheduleDrawnPages);
    documentSize?.observe(container);
  }
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    // Stop drawing once another document owns the pane; nothing else frees this one.
    if (options?.isCurrent && !options.isCurrent()) {
      annotationStore.destroy();
      annotationLayers.forEach((layer) => layer.destroy());
      void loadingTask.destroy();
      throw new PdfRenderSuperseded();
    }
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    if (pageNumber === 1) {
      outputScale = pdfOutputScale(
        window.devicePixelRatio,
        viewport.width * viewport.height,
        Math.min(document.numPages, PDF_LIVE_PAGE_ESTIMATE),
      );
    }
    const pageElement = window.document.createElement("div");
    pageElement.className = "pdf-page-wrap";
    pageElement.dataset.page = String(pageNumber);
    pageElement.style.width = `${viewport.width}px`;
    pageElement.style.height = `${viewport.height}px`;
    container.appendChild(pageElement);
    let canvas: HTMLCanvasElement | null = null;
    let drawing: Promise<HTMLCanvasElement | null> | null = null;
    let renderTask: ReturnType<typeof page.render> | null = null;
    const pageScale = outputScale;
    const draw = (): Promise<HTMLCanvasElement | null> => {
      if (drawing) return drawing;
      const target = window.document.createElement("canvas");
      target.className = "pdf-page";
      // Back the canvas with device pixels so text stays sharp on Retina displays.
      target.width = Math.floor(viewport.width * pageScale);
      target.height = Math.floor(viewport.height * pageScale);
      target.style.width = `${viewport.width}px`;
      const context = target.getContext("2d");
      if (!context) return Promise.resolve(null);
      pageElement.prepend(target);
      canvas = target;
      const task = page.render({
        canvas: target,
        canvasContext: context,
        viewport,
        transform: pageScale === 1 ? undefined : [pageScale, 0, 0, pageScale, 0, 0],
      });
      renderTask = task;
      drawing = task.promise.then(
        () => target,
        () => null,
      );
      return drawing;
    };
    const release = (): void => {
      if (!drawing) return;
      renderTask?.cancel();
      renderTask = null;
      drawing = null;
      if (canvas) {
        // Zero-sized first so WebKit frees the backing store right away.
        canvas.width = 0;
        canvas.height = 0;
        canvas.remove();
        canvas = null;
      }
    };
    const snapshot = async (width: number): Promise<HTMLCanvasElement | null> => {
      const small = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const target = window.document.createElement("canvas");
      target.width = Math.max(1, Math.round(small.width));
      target.height = Math.max(1, Math.round(small.height));
      const context = target.getContext("2d");
      if (!context) return null;
      try {
        await page.render({ canvas: target, canvasContext: context, viewport: small }).promise;
        return target;
      } catch {
        return null;
      }
    };
    if (!lazyDraw) await draw();
    // Text extraction powers the find feature; never let it block the visible
    // page render (it can fail per-file on some PDFs).
    let pageText = "";
    let itemCount = 0;
    try {
      const textContent = await page.getTextContent();
      itemCount = textContent.items.length;
      fontSignals.push(
        inspectPdfPageFonts(
          pageNumber,
          textContent.styles as Record<string, PdfTextContentStyleLike>,
          textContent.items as PdfTextContentItemLike[],
        ),
      );
      const annotationLayer = createAnnotationLayer(window.document, pageNumber, RENDER_SCALE);
      annotationLayer.render(annotationStore.document.annotations);
      annotationLayers[pageNumber - 1] = annotationLayer;
      pageElement.appendChild(annotationLayer.element);
      const textLayer = window.document.createElement("div");
      textLayer.className = "pdf-text-layer";
      textLayer.style.setProperty("--total-scale-factor", String(viewport.scale));
      pageElement.appendChild(textLayer);
      await new pdfjs.TextLayer({
        textContentSource: textContent,
        container: textLayer,
        viewport,
      }).render();
      pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
    } catch {
      fontSignals.push({ page: pageNumber, fonts: [] });
      // Page stays visible; it just won't be searchable.
    }
    let objectSignal: PdfPageObjectSignal = {
      page: pageNumber,
      imagePaints: 0,
      vectorPaints: 0,
      textPaints: 0,
      annotationPaints: 0,
      objects: [],
    };
    // Detected objects are placed through the viewport so rotation and the crop box apply.
    const toPage = (x: number, y: number): { x: number; y: number } => {
      const [viewX, viewY] = viewport.convertToViewportPoint(x, y);
      return { x: viewX / RENDER_SCALE, y: viewY / RENDER_SCALE };
    };
    try {
      const operatorList = await page.getOperatorList();
      objectSignal = inspectPdfPageOperators(
          pageNumber,
          Array.from(operatorList.fnArray),
          pdfjs.OPS as Record<string, number>,
          Array.from(operatorList.argsArray),
          viewport.height / RENDER_SCALE,
          toPage,
      );
    } catch {
      // Keep the page editable even if operator inspection fails.
    }
    try {
      const annotations = await page.getAnnotations();
      objectSignal = mergePdfPageObjectSignals(
        objectSignal,
        inspectPdfPageAnnotations(
          pageNumber,
          viewport.height / RENDER_SCALE,
          annotations,
          toPage,
        ),
      );
    } catch {
      // Annotation extraction can fail separately from drawing.
    }
    objectSignals.push(objectSignal);
    const overlay = window.document.createElement("div");
    overlay.className = "pdf-edit-layer";
    const pageView: PdfPageView = {
      element: pageElement,
      overlay,
      text: pageText,
      box: {
        page: pageNumber,
        width: viewport.width / RENDER_SCALE,
        height: viewport.height / RENDER_SCALE,
      },
      draw,
      release,
      snapshot,
    };
    if (lazyDraw) scheduleDrawnPages();
    overlay.addEventListener("click", (event) => addOperationAt(pageView, event));
    pageElement.appendChild(overlay);
    pages.push(pageView);
    textSignals.push({ page: pageNumber, text: pageText, itemCount });
    if (pageNumber === options?.initialPage) {
      pageElement.scrollIntoView({ block: "start" });
    }
  }
  const annotationController = createAnnotationController(host, annotationStore, pages, annotationLayers, () => activeTool === "select", path, annotationBase, annotationTitle);
  const onAnnotationsShortcut = (): void => toggleInspector("annotations");
  const onCopyQuoteShortcut = (): void => annotationController.copy();
  host.addEventListener(PDF_ANNOTATIONS_EVENT, onAnnotationsShortcut);
  host.addEventListener(PDF_COPY_QUOTE_EVENT, onCopyQuoteShortcut);
  annotationPanel = createAnnotationsPanel(window.document, {
    list: () => annotationStore.document.annotations,
    open: (item) => { goToPage(item.page); annotationLayers[item.page - 1]?.flash(item.id); },
    edit: (item) => { goToPage(item.page); annotationController.edit(item); },
    copy: (item) => { void copyQuote(item, annotationTitle, path, annotationBase).catch((error) => setStatus(String(error), { sticky: true })); },
    export: (items) => options?.onExportAnnotations?.(items, annotationTitle, path),
  });
  renderThumbnailPanel();
  capabilitySummary = summarizePdfCapabilities(textSignals);
  setCurrentPage(pages.length ? Math.min(Math.max(options?.initialPage ?? 1, 1), pages.length) : 0);
  syncToolbar();
  inspector.refresh("support");
  if (!hasPdfEdits(editDocument)) {
    setStatus(pdfCapabilityMessage(capabilitySummary));
  }
  renderEditOverlays();

  const clear = (): void => {
    pages.forEach(({ element }) => {
      element.classList.remove("pdf-find-page", "active");
      element.querySelector(".pdf-find-count")?.remove();
      element
        .querySelectorAll(".pdf-text-match")
        .forEach((match) => match.classList.remove("pdf-text-match"));
    });
    matches = [];
    active = -1;
  };
  const move = (delta: number): { count: number; active: number } => {
    if (!matches.length) return { count: 0, active: 0 };
    active = (active + delta + matches.length) % matches.length;
    pages.forEach(({ element }) => element.classList.remove("active"));
    const page = pages[matches[active]];
    page.element.classList.add("active");
    page.element.scrollIntoView({ block: "center", behavior: "smooth" });
    return { count: matches.length, active: active + 1 };
  };
  // Width fits use the widest page so mixed sizes never scroll sideways or
  // change zoom while scrolling; Fit Page uses the page in view.
  const fitZoom = (mode: PdfFitMode): number | null => {
    const view = pages[Math.max(currentPage, 1) - 1];
    const docked = inspector.page !== null && inspector.layout === "docked";
    const width = host.clientWidth - (docked ? PDF_INSPECTOR_WIDTH : 0);
    const height = host.clientHeight - toolbar.element.offsetHeight;
    if (!view || width <= 0 || height <= 0) return null;
    const widest = Math.max(...pages.map((page) => page.box.width));
    const box = mode === "page" ? view.box : { width: widest, height: view.box.height };
    return pdfFitZoom(
      mode,
      { width: box.width * RENDER_SCALE, height: box.height * RENDER_SCALE },
      { width, height },
    );
  };
  const keepAnchor = (change: () => void): void => {
    const view = visiblePage();
    const top = toolbar.element.getBoundingClientRect().bottom;
    const before = view?.element.getBoundingClientRect();
    const fraction = before && before.height > 0 ? (top - before.top) / before.height : 0;
    change();
    if (!view) return;
    const after = view.element.getBoundingClientRect();
    host.scrollTop += after.top + fraction * after.height - top;
  };
  return {
    goToPage,
    flashAnnotation: (id) => annotationLayers.forEach((layer) => layer.flash(id)),
    pageCount: () => pages.length,
    fitZoom,
    keepAnchor,
    setZoomState: (zoom, fit) => {
      zoomState = { zoom, fit };
      // The docked inspector's margin is set in screen pixels, undoing the page zoom.
      container.style.setProperty("--pdf-zoom", String(zoom));
      syncToolbar();
    },
    setQuery: (query) => {
      clear();
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!escaped) return 0;
      const pattern = new RegExp(escaped, "gi");
      pages.forEach((page, pageIndex) => {
        const count = [...page.text.matchAll(pattern)].length;
        if (!count) return;
        page.element.classList.add("pdf-find-page");
        page.element
          .querySelectorAll<HTMLElement>(".pdf-text-layer span")
          .forEach((span) => {
            pattern.lastIndex = 0;
            if (pattern.test(span.textContent ?? "")) {
              span.classList.add("pdf-text-match");
            }
          });
        const badge = window.document.createElement("span");
        badge.className = "pdf-find-count";
        badge.textContent = `${count} match${count === 1 ? "" : "es"}`;
        page.element.appendChild(badge);
        for (let index = 0; index < count; index += 1) matches.push(pageIndex);
      });
      if (matches.length) move(1);
      return matches.length;
    },
    move,
    clear,
    checkDisk,
    destroy: () => {
      destroyed = true;
      host.removeEventListener(PDF_ANNOTATIONS_EVENT, onAnnotationsShortcut);
      host.removeEventListener(PDF_COPY_QUOTE_EVENT, onCopyQuoteShortcut);
      annotationController.destroy();
      annotationStore.destroy();
      annotationLayers.forEach((layer) => layer.destroy());
      annotationNotice?.remove();
      clear();
      toolbarSize?.disconnect();
      toolbar.destroy();
      host.removeEventListener("scroll", schedulePageTrack);
      if (pageFrame) cancelAnimationFrame(pageFrame);
      if (drawFrame) cancelAnimationFrame(drawFrame);
      documentSize?.disconnect();
      window.removeEventListener("scroll", scheduleDrawnPages, { capture: true });
      window.removeEventListener("resize", scheduleDrawnPages);
      pages.forEach((page) => page.release());
      closeThumbnailPanel();
      inspector.destroy();
      container.removeEventListener("mouseup", onReplaceMouseUp);
      container.removeEventListener("pointerdown", onDrawerOutside);
      host.removeEventListener(PDF_EDIT_EVENT, onMenuEdit);
      host.removeEventListener(PDF_SAVE_EVENT, onMenuSave);
      host.removeEventListener(PDF_SAVE_AS_EVENT, onMenuSaveAs);
      host.removeEventListener("keydown", keyHandler);
      // Frees the parsed document and its worker-side data; a PDF tab switch would
      // otherwise keep every visited document alive.
      void loadingTask.destroy();
    },
  };
}

export function scrollPdfToPage(host: HTMLElement, page: number): boolean {
  const element = host.querySelector<HTMLElement>(
    `.pdf-page-wrap[data-page="${page}"]`,
  );
  element?.scrollIntoView({ block: "start", behavior: "smooth" });
  return Boolean(element);
}
