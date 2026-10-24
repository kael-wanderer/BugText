import { invoke } from "@tauri-apps/api/core";
import { readPdfDraft, writePdfDraft } from "./pdf-draft-store";
import { confirm } from "@tauri-apps/plugin-dialog";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pickExportPath, pickImagePath } from "./files";
import {
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
  setQuery: (query: string) => number;
  move: (delta: number) => { count: number; active: number };
  clear: () => void;
  /** Reloads when the file changed on disk, or asks first when there are unsaved edits. */
  checkDisk: () => Promise<void>;
  destroy: () => void;
};

export type PdfRenderOptions = {
  initialPage?: number;
  onEditDirtyChange?: (dirty: boolean) => void;
  onReloadRequest?: () => void;
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
export const PDF_SAVE_AS_EVENT = "bugtext:pdf-save-as";

const RENDER_SCALE = 1.4;
// Upper bound on canvas pixels for one document (about 1 GB of RGBA). Every page
// is drawn up front, so a long PDF on a Retina display drops back toward 1x.
const PDF_CANVAS_PIXEL_BUDGET = 256 * 1024 * 1024;

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
type PdfEditTool = "select" | "text" | "cover" | "replace" | "image";
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
  let undoStack: PdfEditDocument[] = [];
  let redoStack: PdfEditDocument[] = [];
  const toolbar = window.document.createElement("div");
  toolbar.className = "pdf-edit-toolbar";
  const toolButtons = new Map<PdfEditTool, HTMLButtonElement>();
  const saveButton = window.document.createElement("button");
  const saveAsButton = window.document.createElement("button");
  const reviewButton = window.document.createElement("button");
  const proofButton = window.document.createElement("button");
  const imageButton = window.document.createElement("button");
  const undoButton = window.document.createElement("button");
  const redoButton = window.document.createElement("button");
  const snapButton = window.document.createElement("button");
  const deleteButton = window.document.createElement("button");
  const editSelectedButton = window.document.createElement("button");
  const directSelectedButton = window.document.createElement("button");
  const reflowButton = window.document.createElement("button");
  const ocrButton = window.document.createElement("button");
  const ocrReviewButton = window.document.createElement("button");
  const capabilityButton = window.document.createElement("button");
  const thumbnailButton = window.document.createElement("button");
  const ocrLanguageInput = window.document.createElement("input");
  const fontFamilySelect = window.document.createElement("select");
  const fontSizeInput = window.document.createElement("input");
  const boldButton = window.document.createElement("button");
  const italicButton = window.document.createElement("button");
  const alignSelect = window.document.createElement("select");
  const colorInput = window.document.createElement("input");
  const opacityInput = window.document.createElement("input");
  const coverColorInput = window.document.createElement("input");
  const coverOpacityInput = window.document.createElement("input");
  const status = window.document.createElement("span");
  status.className = "pdf-edit-status";
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
    updateStyleBar();
    toolButtons.forEach((button, key) => {
      button.classList.toggle("active", key === tool);
    });
    setStatus(
      tool === "select"
        ? "Select or drag an edit"
        : tool === "text"
          ? "Click a page to add text"
          : tool === "cover"
            ? "Click a page to cover content"
            : tool === "replace"
              ? "Click a page to replace visible text"
              : pendingImage
                ? `Click a page to place ${pendingImage.name}`
                : "Choose an image to place",
    );
  };
  const addToolButton = (tool: PdfEditTool, label: string): void => {
    const button = window.document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = label;
    button.addEventListener("click", () => setTool(tool));
    toolButtons.set(tool, button);
    toolbar.appendChild(button);
  };
  addToolButton("select", "Select");
  addToolButton("text", "Text");
  addToolButton("cover", "Cover");
  addToolButton("replace", "Replace");
  imageButton.type = "button";
  imageButton.textContent = "Image";
  imageButton.title = "Add a PNG or JPEG image object";
  imageButton.addEventListener("click", () => {
    void (async () => {
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
    })();
  });
  toolButtons.set("image", imageButton);
  toolbar.appendChild(imageButton);
  undoButton.type = "button";
  undoButton.textContent = "Undo";
  undoButton.title = "Undo PDF edit";
  undoButton.disabled = true;
  redoButton.type = "button";
  redoButton.textContent = "Redo";
  redoButton.title = "Redo PDF edit";
  redoButton.disabled = true;
  snapButton.type = "button";
  snapButton.textContent = "Snap";
  snapButton.title = "Snap PDF edit placement to a 5-point grid";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.disabled = true;
  editSelectedButton.type = "button";
  editSelectedButton.textContent = "Edit Text";
  editSelectedButton.title = "Replace the currently selected PDF text visually";
  directSelectedButton.type = "button";
  directSelectedButton.textContent = "Direct";
  directSelectedButton.title = "Try a real PDF text rewrite for the selected text";
  reflowButton.type = "button";
  reflowButton.textContent = "Reflow";
  reflowButton.title = "Reflow the selected PDF text edit";
  reflowButton.disabled = true;
  ocrButton.type = "button";
  ocrButton.textContent = "OCR Page";
  ocrButton.title = "Recognize text on the visible page";
  ocrReviewButton.type = "button";
  ocrReviewButton.textContent = "Review OCR";
  ocrReviewButton.title = "Review and correct OCR text blocks";
  ocrReviewButton.disabled = true;
  capabilityButton.type = "button";
  capabilityButton.textContent = "Limits";
  capabilityButton.title = "Show PDF editing capabilities by page";
  capabilityButton.disabled = true;
  thumbnailButton.type = "button";
  thumbnailButton.textContent = "Thumbs";
  thumbnailButton.title = "Show PDF page thumbnails";
  thumbnailButton.disabled = true;
  ocrLanguageInput.type = "text";
  ocrLanguageInput.value = "eng";
  ocrLanguageInput.title = "OCR language, for example eng or eng+vie";
  ocrLanguageInput.className = "pdf-edit-ocr-language";
  saveButton.type = "button";
  saveButton.textContent = "Save";
  saveButton.disabled = true;
  saveAsButton.type = "button";
  saveAsButton.textContent = "Save As";
  saveAsButton.disabled = true;
  reviewButton.type = "button";
  reviewButton.textContent = "Review";
  reviewButton.title = "Review pending PDF edits before saving";
  reviewButton.disabled = true;
  proofButton.type = "button";
  proofButton.textContent = "Proof";
  proofButton.title = "Proofread pending PDF text edits";
  proofButton.disabled = true;
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
  toolbar.append(
    undoButton,
    redoButton,
    snapButton,
    deleteButton,
    editSelectedButton,
    directSelectedButton,
    reflowButton,
    ocrLanguageInput,
    ocrButton,
    ocrReviewButton,
    capabilityButton,
    thumbnailButton,
    reviewButton,
    proofButton,
    saveButton,
    saveAsButton,
    status,
  );
  // Style controls sit on their own row and only appear while they apply: text
  // controls for text edits or tools, cover controls for covers.
  const styleBar = window.document.createElement("div");
  styleBar.className = "pdf-edit-stylebar";
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
  const coverLabel = window.document.createElement("span");
  coverLabel.className = "pdf-edit-style-label";
  coverLabel.textContent = "Cover";
  coverStyleGroup.append(coverLabel, coverColorInput, coverOpacityInput);
  styleBar.append(textStyleGroup, coverStyleGroup);
  toolbar.append(styleBar);
  const updateStyleBar = (): void => {
    const operation = selectedOperation();
    const type = operation?.type;
    const showText =
      activeTool === "text" ||
      activeTool === "replace" ||
      type === "textBox" ||
      type === "replacementText" ||
      type === "directTextEdit";
    const showCover =
      activeTool === "cover" ||
      activeTool === "replace" ||
      type === "coverPatch" ||
      type === "replacementText";
    textStyleGroup.hidden = !showText;
    coverStyleGroup.hidden = !showCover;
    styleBar.hidden = !showText && !showCover;
  };
  const container = window.document.createElement("div");
  container.className = "pdf-document";
  container.dataset.path = path;
  host.append(toolbar, container);
  // Side panels sit just below the toolbar, which wraps onto more rows when narrow.
  const toolbarSize =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          host.style.setProperty("--pdf-toolbar-height", `${toolbar.offsetHeight}px`);
        });
  toolbarSize?.observe(toolbar);
  const pages: PdfPageView[] = [];
  const textSignals: PdfPageTextSignal[] = [];
  const objectSignals: PdfPageObjectSignal[] = [];
  const fontSignals: PdfPageFontSignal[] = [];
  let ocrReviewPanel: HTMLElement | null = null;
  let capabilityPanel: HTMLElement | null = null;
  let thumbnailPanel: HTMLElement | null = null;
  let reviewPanel: HTMLElement | null = null;
  let proofPanel: HTMLElement | null = null;
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
    deleteButton.disabled = !id;
    reflowButton.disabled =
      !operation ||
      (operation.type !== "textBox" &&
        operation.type !== "replacementText" &&
        operation.type !== "directTextEdit" &&
        operation.type !== "ocrTextBlock");
    container
      .querySelectorAll<HTMLElement>(".pdf-edit-item")
      .forEach((item) => item.classList.toggle("selected", item.dataset.editId === id));
  };
  const updateToolbarState = (): void => {
    saveButton.disabled = saving || !hasPdfEdits(editDocument);
    saveAsButton.disabled = saving || !hasPdfEdits(editDocument);
    reviewButton.disabled = saving || !hasPdfEdits(editDocument);
    const proofIssues = listPdfProofIssues(editDocument);
    proofButton.disabled = saving || !hasPdfEdits(editDocument);
    proofButton.textContent = proofIssues.length ? `Proof ${proofIssues.length}` : "Proof";
    undoButton.disabled = saving || undoStack.length === 0;
    redoButton.disabled = saving || redoStack.length === 0;
    deleteButton.disabled = !selectedOperationId;
    const ocrSummary = summarizeOcrReview(listOcrReviewItems(editDocument));
    ocrReviewButton.disabled = ocrSummary.total === 0;
    ocrReviewButton.textContent =
      ocrSummary.total === 0
        ? "Review OCR"
        : ocrSummary.lowConfidence > 0
          ? `Review OCR ${ocrSummary.lowConfidence}/${ocrSummary.total}`
          : `Review OCR ${ocrSummary.total}`;
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
  const closeCapabilityPanel = (): void => {
    capabilityPanel?.remove();
    capabilityPanel = null;
  };
  const renderCapabilityPanel = (): void => {
    if (!capabilityPanel || !capabilitySummary) return;
    capabilityPanel.innerHTML = "";
    const header = window.document.createElement("header");
    const title = window.document.createElement("strong");
    title.textContent = "PDF Editing Limits";
    const meta = window.document.createElement("span");
    meta.textContent = pdfCapabilityMessage(capabilitySummary);
    const close = window.document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Close editing limits";
    close.addEventListener("click", closeCapabilityPanel);
    header.append(title, meta, close);
    capabilityPanel.appendChild(header);

    const list = window.document.createElement("div");
    list.className = "pdf-capability-list";
    for (const detail of pdfCapabilityDetails(capabilitySummary)) {
      const row = window.document.createElement("section");
      row.className = `pdf-capability-row ${detail.capability}`;
      const rowHeader = window.document.createElement("div");
      const focus = window.document.createElement("button");
      focus.type = "button";
      focus.textContent = `Page ${detail.page}`;
      focus.addEventListener("click", () => focusPage(detail.page));
      const label = window.document.createElement("strong");
      label.textContent = detail.label;
      const badge = window.document.createElement("span");
      badge.textContent = detail.directEditingSafe ? "Direct candidate" : "Fallback";
      rowHeader.append(focus, label, badge);
      const message = window.document.createElement("p");
      message.textContent = detail.message;
      row.append(rowHeader, message);
      const objectSignal = objectSignals.find((signal) => signal.page === detail.page);
      const fontSignal = fontSignals.find((signal) => signal.page === detail.page);
      if (fontSignal) {
        const fonts = window.document.createElement("p");
        fonts.className = "pdf-capability-fonts";
        fonts.textContent = pdfFontSignalMessage(fontSignal);
        row.appendChild(fonts);
      }
      if (objectSignal) {
        const objects = window.document.createElement("p");
        objects.className = "pdf-capability-objects";
        objects.textContent = pdfObjectSignalMessage(objectSignal);
        row.appendChild(objects);
        if (objectSignal.objects.length) {
          const objectList = window.document.createElement("div");
          objectList.className = "pdf-capability-object-list";
          objectSignal.objects.forEach((object, index) => {
            const objectRow = window.document.createElement("div");
            const objectKind =
              object.type === "image"
                ? "Image"
                : object.type === "annotation"
                  ? object.label || "Annotation"
                  : "Vector";
            const focusObject = window.document.createElement("button");
            focusObject.type = "button";
            focusObject.textContent = `${objectKind} ${index + 1}`;
            focusObject.title = `Focus detected ${object.type} bounds`;
            focusObject.addEventListener("click", () => {
              focusPage(object.page);
              setStatus(
                `Detected ${object.type} bounds: ${Math.round(object.rect.width)} x ${Math.round(object.rect.height)} pt`,
              );
            });
            const coverObject = window.document.createElement("button");
            coverObject.type = "button";
            coverObject.textContent = "Cover";
            coverObject.title = `Safely cover this detected ${object.type}; source-level object rewrites stay disabled for unsupported PDFs`;
            coverObject.addEventListener("click", () => {
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
            objectRow.append(focusObject, coverObject);
            objectList.appendChild(objectRow);
          });
          row.appendChild(objectList);
        }
      }
      list.appendChild(row);
    }
    capabilityPanel.appendChild(list);
  };
  const openCapabilityPanel = (): void => {
    if (capabilityPanel) {
      closeCapabilityPanel();
      return;
    }
    capabilityPanel = window.document.createElement("aside");
    capabilityPanel.className = "pdf-capability-panel";
    host.appendChild(capabilityPanel);
    renderCapabilityPanel();
  };
  const closeThumbnailPanel = (): void => {
    thumbnailPanel?.remove();
    thumbnailPanel = null;
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
    for (const pageView of pages) {
      const source = pageView.element.querySelector<HTMLCanvasElement>("canvas.pdf-page");
      if (!source) continue;
      const button = window.document.createElement("button");
      button.type = "button";
      button.className = "pdf-thumbnail";
      button.title = `Go to page ${pageView.box.page}`;
      button.addEventListener("click", () => focusPage(pageView.box.page));
      const canvas = window.document.createElement("canvas");
      const ratio = source.height > 0 ? source.width / source.height : 0.75;
      canvas.width = 96;
      canvas.height = Math.max(80, Math.round(canvas.width / Math.max(0.2, ratio)));
      const context = canvas.getContext("2d");
      context?.drawImage(source, 0, 0, canvas.width, canvas.height);
      const label = window.document.createElement("span");
      label.textContent = String(pageView.box.page);
      button.append(canvas, label);
      list.appendChild(button);
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
  const closeReviewPanel = (): void => {
    reviewPanel?.remove();
    reviewPanel = null;
  };
  const closeProofPanel = (): void => {
    proofPanel?.remove();
    proofPanel = null;
  };
  const renderReviewPanel = (): void => {
    if (!reviewPanel) return;
    reviewPanel.innerHTML = "";
    const editedPages = editDocument.pages.filter((page) => page.operations.length > 0);
    const header = window.document.createElement("header");
    const title = window.document.createElement("strong");
    title.textContent = "Review Edits";
    const meta = window.document.createElement("span");
    meta.textContent = editedPages.length
      ? `${editedPages.length} edited page${editedPages.length === 1 ? "" : "s"}`
      : "No pending edits";
    const close = window.document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Close edit review";
    close.addEventListener("click", closeReviewPanel);
    header.append(title, meta, close);
    reviewPanel.appendChild(header);

    const list = window.document.createElement("div");
    list.className = "pdf-review-list";
    if (!editedPages.length) {
      const empty = window.document.createElement("p");
      empty.className = "pdf-review-empty";
      empty.textContent = "There are no pending PDF edits.";
      list.appendChild(empty);
    }
    for (const page of editedPages) {
      const pageView = pages.find((item) => item.box.page === page.page);
      const source = pageView?.element.querySelector<HTMLCanvasElement>("canvas.pdf-page");
      const row = window.document.createElement("section");
      row.className = "pdf-review-row";
      const rowHeader = window.document.createElement("div");
      const focus = window.document.createElement("button");
      focus.type = "button";
      focus.textContent = `Page ${page.page}`;
      focus.addEventListener("click", () => focusPage(page.page));
      const count = window.document.createElement("span");
      count.textContent = `${page.operations.length} edit${page.operations.length === 1 ? "" : "s"}`;
      rowHeader.append(focus, count);
      row.appendChild(rowHeader);

      if (source && pageView) {
        const preview = window.document.createElement("div");
        preview.className = "pdf-review-preview";
        const pair = createReviewCanvasPair(source, pageView.box, page.operations);
        const beforeFigure = window.document.createElement("figure");
        const beforeLabel = window.document.createElement("figcaption");
        beforeLabel.textContent = "Before";
        beforeFigure.append(pair.before, beforeLabel);
        const afterFigure = window.document.createElement("figure");
        const afterLabel = window.document.createElement("figcaption");
        afterLabel.textContent = "After";
        afterFigure.append(pair.after, afterLabel);
        preview.append(beforeFigure, afterFigure);
        row.appendChild(preview);
      }

      const summary = window.document.createElement("ul");
      summary.className = "pdf-review-summary";
      page.operations.forEach((operation) => {
        const item = window.document.createElement("li");
        item.textContent =
          operation.type === "directTextEdit"
            ? `Direct edit fallback: ${operation.replacementText}`
            : operation.type === "replacementText"
              ? `Replacement: ${operation.text.value}`
              : operation.type === "coverPatch"
                ? "Cover patch"
                : operation.type === "ocrTextBlock"
                  ? `OCR block ${Math.round(operation.confidence * 100)}%`
                  : operation.type === "imageBox"
                    ? `Image: ${operation.name}`
                    : `Text: ${operation.text}`;
        summary.appendChild(item);
      });
      row.appendChild(summary);
      list.appendChild(row);
    }
    reviewPanel.appendChild(list);
  };
  const refreshReviewPanel = (): void => {
    if (reviewPanel) renderReviewPanel();
  };
  const openReviewPanel = (): void => {
    if (reviewPanel) {
      closeReviewPanel();
      return;
    }
    reviewPanel = window.document.createElement("aside");
    reviewPanel.className = "pdf-review-panel";
    host.appendChild(reviewPanel);
    renderReviewPanel();
  };
  const renderProofPanel = (): void => {
    if (!proofPanel) return;
    proofPanel.innerHTML = "";
    const issues = listPdfProofIssues(editDocument);
    const header = window.document.createElement("header");
    const title = window.document.createElement("strong");
    title.textContent = "Proofing";
    const meta = window.document.createElement("span");
    meta.textContent = issues.length
      ? `${issues.length} suggestion${issues.length === 1 ? "" : "s"}`
      : "No suggestions";
    const close = window.document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Close proofing";
    close.addEventListener("click", closeProofPanel);
    header.append(title, meta, close);
    proofPanel.appendChild(header);

    const list = window.document.createElement("div");
    list.className = "pdf-proof-list";
    if (!issues.length) {
      const empty = window.document.createElement("p");
      empty.className = "pdf-proof-empty";
      empty.textContent = "No proofing suggestions for pending text edits.";
      list.appendChild(empty);
    }
    for (const issue of issues) {
      const row = window.document.createElement("section");
      row.className = "pdf-proof-row";
      const rowHeader = window.document.createElement("div");
      const focus = window.document.createElement("button");
      focus.type = "button";
      focus.textContent = `Page ${issue.page}`;
      focus.addEventListener("click", () => focusOperation(issue.operationId));
      const message = window.document.createElement("span");
      message.textContent = issue.message;
      let suggestionText = issue.replacement;
      const apply = window.document.createElement("button");
      apply.type = "button";
      apply.textContent = "Apply";
      apply.addEventListener("click", () => {
        const page = pages.find((item) => item.box.page === issue.page)?.box;
        if (!page) return;
        applyEditDocument(
          updatePdfEditOperationText(
            editDocument,
            page,
            issue.operationId,
            suggestionText,
          ),
        );
        renderEditOverlays();
        renderProofPanel();
        setStatus("Applied proofing suggestion");
      });
      rowHeader.append(focus, message, apply);
      const textarea = window.document.createElement("textarea");
      textarea.spellcheck = true;
      textarea.value = issue.replacement;
      textarea.rows = Math.min(5, Math.max(2, issue.replacement.split(/\r?\n/).length));
      // Typing previews live; leaving the box records one undo step. The panel is
      // not rebuilt while typing, so the box keeps focus.
      let beforeTyping: PdfEditDocument | null = null;
      textarea.addEventListener("focus", () => {
        beforeTyping = clonePdfEditDocument(editDocument);
        focusOperation(issue.operationId);
      });
      textarea.addEventListener("input", () => {
        suggestionText = textarea.value;
        const page = pages.find((item) => item.box.page === issue.page)?.box;
        if (!page) return;
        applyEditDocument(
          updatePdfEditOperationText(
            editDocument,
            page,
            issue.operationId,
            textarea.value,
          ),
          { history: false },
        );
        renderEditOverlays({ refreshProof: false });
      });
      textarea.addEventListener("blur", () => {
        if (beforeTyping) commitTransientEdit(beforeTyping);
        beforeTyping = null;
      });
      const reflow = window.document.createElement("button");
      reflow.type = "button";
      reflow.textContent = "Reflow";
      reflow.addEventListener("click", () => {
        const page = pages.find((item) => item.box.page === issue.page)?.box;
        if (!page) return;
        applyEditDocument(
          reflowPdfEditOperationText(editDocument, page, issue.operationId),
        );
        renderEditOverlays();
        renderProofPanel();
        setStatus("Reflowed PDF edit text");
      });
      row.append(rowHeader, textarea, reflow);
      list.appendChild(row);
    }
    proofPanel.appendChild(list);
  };
  const refreshProofPanel = (): void => {
    if (proofPanel) renderProofPanel();
  };
  const openProofPanel = (): void => {
    if (proofPanel) {
      closeProofPanel();
      return;
    }
    proofPanel = window.document.createElement("aside");
    proofPanel.className = "pdf-proof-panel";
    host.appendChild(proofPanel);
    renderProofPanel();
  };
  const closeOcrReviewPanel = (): void => {
    ocrReviewPanel?.remove();
    ocrReviewPanel = null;
  };
  const renderOcrReviewPanel = (): void => {
    if (!ocrReviewPanel) return;
    ocrReviewPanel.innerHTML = "";
    const items = listOcrReviewItems(editDocument);
    const summary = summarizeOcrReview(items);
    const header = window.document.createElement("header");
    const title = window.document.createElement("strong");
    title.textContent = "OCR Review";
    const meta = window.document.createElement("span");
    meta.textContent =
      summary.total === 0
        ? "No blocks"
        : summary.lowConfidence > 0
          ? `${summary.lowConfidence} low confidence of ${summary.total}`
          : `${summary.total} reviewed blocks`;
    const close = window.document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Close OCR review";
    close.addEventListener("click", closeOcrReviewPanel);
    header.append(title, meta, close);
    ocrReviewPanel.appendChild(header);

    const list = window.document.createElement("div");
    list.className = "pdf-ocr-review-list";
    if (items.length === 0) {
      const empty = window.document.createElement("p");
      empty.className = "pdf-ocr-review-empty";
      empty.textContent = "Run OCR Page to create reviewable text blocks.";
      list.appendChild(empty);
    }
    for (const item of items) {
      const row = window.document.createElement("section");
      row.className = "pdf-ocr-review-row";
      row.classList.toggle("low-confidence", item.confidence < 0.75);
      row.dataset.editId = item.id;
      const rowHeader = window.document.createElement("div");
      const focus = window.document.createElement("button");
      focus.type = "button";
      focus.textContent = `Page ${item.page}`;
      focus.addEventListener("click", () => focusOperation(item.id));
      const confidence = window.document.createElement("span");
      confidence.textContent = `${Math.round(item.confidence * 100)}%`;
      const remove = window.document.createElement("button");
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        applyEditDocument(removeOcrReviewItem(editDocument, item.id));
        if (selectedOperationId === item.id) setSelectedOperation(null);
        renderEditOverlays();
        renderOcrReviewPanel();
      });
      rowHeader.append(focus, confidence, remove);
      const textarea = window.document.createElement("textarea");
      textarea.value = item.text;
      textarea.rows = Math.min(5, Math.max(2, item.text.split(/\r?\n/).length));
      let beforeTyping: PdfEditDocument | null = null;
      textarea.addEventListener("focus", () => {
        beforeTyping = clonePdfEditDocument(editDocument);
        focusOperation(item.id);
      });
      textarea.addEventListener("input", () => {
        applyEditDocument(updateOcrReviewText(editDocument, item.id, textarea.value), {
          history: false,
        });
        renderEditOverlays();
      });
      textarea.addEventListener("blur", () => {
        if (beforeTyping) commitTransientEdit(beforeTyping);
        beforeTyping = null;
      });
      row.append(rowHeader, textarea);
      list.appendChild(row);
    }
    ocrReviewPanel.appendChild(list);
  };
  const refreshOcrReviewPanel = (): void => {
    if (ocrReviewPanel) renderOcrReviewPanel();
  };
  const openOcrReviewPanel = (): void => {
    if (ocrReviewPanel) {
      closeOcrReviewPanel();
      return;
    }
    ocrReviewPanel = window.document.createElement("aside");
    ocrReviewPanel.className = "pdf-ocr-review-panel";
    host.appendChild(ocrReviewPanel);
    renderOcrReviewPanel();
  };
  ocrReviewButton.addEventListener("click", openOcrReviewPanel);
  capabilityButton.addEventListener("click", openCapabilityPanel);
  thumbnailButton.addEventListener("click", openThumbnailPanel);
  reviewButton.addEventListener("click", openReviewPanel);
  proofButton.addEventListener("click", openProofPanel);
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
      // No window.prompt here: Tauri's WKWebView does not implement JS dialogs.
      // Create the operation and drop straight into inline editing instead.
      const rect = rectFromPointer(event, pageView.element, pageView.box, 190, 34);
      const operation: PdfEditOperation = {
        id: operationId(),
        type: "replacementText",
        page: pageView.box.page,
        sourceText: "",
        cover: {
          rect,
          color: currentCoverColor,
          opacity: currentCoverOpacity,
        },
        text: {
          rect,
          value: "Replacement",
          style: currentStyle,
        },
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
  deleteButton.addEventListener("click", deleteSelected);
  undoButton.addEventListener("click", undoPdfEdit);
  redoButton.addEventListener("click", redoPdfEdit);
  snapButton.addEventListener("click", () => {
    snapEnabled = !snapEnabled;
    snapButton.classList.toggle("active", snapEnabled);
    setStatus(snapEnabled ? "Snap enabled" : "Snap disabled");
  });
  const cachePdfSelection = (event: Event): void => {
    event.preventDefault();
    cachedSelectionReplacement = selectionReplacement();
  };
  editSelectedButton.addEventListener("pointerdown", cachePdfSelection);
  editSelectedButton.addEventListener("mousedown", cachePdfSelection);
  editSelectedButton.addEventListener("click", () => {
    const replacement = cachedSelectionReplacement ?? selectionReplacement();
    cachedSelectionReplacement = null;
    if (!replacement) {
      setStatus("Select PDF text first, then choose Edit Text");
      return;
    }
    const operation: PdfEditOperation = {
      id: operationId(),
      type: "replacementText",
      page: replacement.pageView.box.page,
      sourceText: replacement.sourceText,
      cover: {
        rect: replacement.rect,
        rects: replacement.coverRects.length ? replacement.coverRects : undefined,
        color: currentCoverColor,
        opacity: currentCoverOpacity,
      },
      text: {
        rect: replacement.rect,
        value: replacement.sourceText,
        style: replacement.style,
      },
    };
    applyEditDocument(
      addPdfEditOperation(
        editDocument,
        replacement.pageView.box,
        snapIfNeeded(replacement.pageView.box, operation),
      ),
    );
    selectedOperationId = operation.id;
    pendingInlineEditId = operation.id;
    window.getSelection()?.removeAllRanges();
    setTool("select");
    renderEditOverlays();
    setStatus(`Queued replacement on page ${replacement.pageView.box.page}`);
  });
  directSelectedButton.addEventListener("pointerdown", cachePdfSelection);
  directSelectedButton.addEventListener("mousedown", cachePdfSelection);
  directSelectedButton.addEventListener("click", () => {
    const replacement = cachedSelectionReplacement ?? selectionReplacement();
    cachedSelectionReplacement = null;
    if (!replacement) {
      setStatus("Select PDF text first, then choose Direct");
      return;
    }
    const operation: PdfEditOperation = {
      id: operationId(),
      type: "directTextEdit",
      page: replacement.pageView.box.page,
      sourceId: `page-${replacement.pageView.box.page}-selection`,
      originalText: replacement.sourceText,
      replacementText: replacement.sourceText,
      rect: replacement.rect,
      fallbackCoverRects: replacement.coverRects.length
        ? replacement.coverRects
        : undefined,
      fallbackStyle: replacement.style,
    };
    applyEditDocument(
      addPdfEditOperation(
        editDocument,
        replacement.pageView.box,
        snapIfNeeded(replacement.pageView.box, operation),
      ),
    );
    selectedOperationId = operation.id;
    pendingInlineEditId = operation.id;
    window.getSelection()?.removeAllRanges();
    setTool("select");
    renderEditOverlays();
    setStatus("Queued direct edit; Save falls back visually if unsafe");
  });
  reflowButton.addEventListener("click", () => {
    const selected = selectedOperation();
    if (!selected) return;
    const page = pages.find((item) => item.box.page === selected.page)?.box;
    if (!page) return;
    applyEditDocument(reflowPdfEditOperationText(editDocument, page, selected.id));
    renderEditOverlays();
    setStatus("Reflowed selected PDF edit text");
  });
  const visiblePage = (): PdfPageView | null => {
    const index = mostVisiblePageIndex(
      pages.map((page) => page.element.getBoundingClientRect()),
      toolbar.getBoundingClientRect().bottom,
      window.innerHeight,
    );
    return index < 0 ? null : pages[index];
  };
  ocrButton.addEventListener("click", () => {
    void (async () => {
      const page = visiblePage();
      const canvas = page?.element.querySelector<HTMLCanvasElement>("canvas.pdf-page");
      if (!page || !canvas) return;
      ocrButton.disabled = true;
      setStatus(`Running OCR on page ${page.box.page}...`);
      try {
        const { recognizePdfPageCanvas } = await import("./pdf-ocr");
        const operations = await recognizePdfPageCanvas(
          canvas,
          page.box,
          ocrLanguageInput.value,
        );
        if (!operations.length) {
          setStatus(`No OCR text found on page ${page.box.page}`);
          return;
        }
        let nextDocument = editDocument;
        operations.forEach((operation) => {
          nextDocument = addPdfEditOperation(nextDocument, page.box, operation);
        });
        applyEditDocument(nextDocument);
        renderEditOverlays();
        refreshOcrReviewPanel();
        setStatus(`Added OCR text layer on page ${page.box.page}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        ocrButton.disabled = false;
        updateToolbarState();
      }
    })();
  });
  const keyHandler = (event: KeyboardEvent): void => {
    if (isTextEntryTarget(event.target)) return;
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
    }
  };
  host.addEventListener("keydown", keyHandler);
  const saveEditedPdf = async (): Promise<void> => {
    if (!hasPdfEdits(editDocument) || saving) return;
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
        setStatus("Not saved: the PDF changed on disk. Save As keeps both versions.", {
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
      const { writeEditedPdf } = await import("./pdf-edit-writer");
      const output = await writeEditedPdf(
        new Uint8Array(bytes),
        editDocument,
        loadSystemFontBytes,
      );
      await invoke("save_bytes", { path, bytes: Array.from(output) });
      editDocument = createPdfEditDocument(path);
      undoStack = [];
      redoStack = [];
      selectedOperationId = null;
      void storeDraft(path, editDocument);
      closeOcrReviewPanel();
      closeCapabilityPanel();
      closeThumbnailPanel();
      closeReviewPanel();
      closeProofPanel();
      options?.onEditDirtyChange?.(false);
      setStatus(`Saved. Backup: ${backupPath}`);
      options?.onReloadRequest?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), { sticky: true });
    } finally {
      saving = false;
      updateToolbarState();
    }
  };
  const saveEditedPdfAs = async (): Promise<void> => {
    if (!hasPdfEdits(editDocument) || saving) return;
    const out = await pickExportPath("pdf");
    if (!out) return;
    saving = true;
    updateToolbarState();
    try {
      setStatus("Saving edited PDF...");
      const { writeEditedPdf } = await import("./pdf-edit-writer");
      const output = await writeEditedPdf(
        new Uint8Array(bytes),
        editDocument,
        loadSystemFontBytes,
      );
      await invoke("save_bytes", { path: out, bytes: Array.from(output) });
      setStatus("Edited PDF saved", { sticky: true });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), { sticky: true });
    } finally {
      saving = false;
      updateToolbarState();
    }
  };
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
    toolbar.after(diskNotice);
  };
  const onMenuSave = (): void => {
    void saveEditedPdf();
  };
  const onMenuSaveAs = (): void => {
    void saveEditedPdfAs();
  };
  host.addEventListener(PDF_SAVE_EVENT, onMenuSave);
  host.addEventListener(PDF_SAVE_AS_EVENT, onMenuSaveAs);
  saveButton.addEventListener("click", () => {
    void (async () => {
      await saveEditedPdf();
    })();
  });
  saveAsButton.addEventListener("click", () => {
    void (async () => {
      await saveEditedPdfAs();
    })();
  });
  setTool("select");

  let outputScale = 1;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    // Stop drawing once another document owns the pane; nothing else frees this one.
    if (options?.isCurrent && !options.isCurrent()) {
      void loadingTask.destroy();
      throw new PdfRenderSuperseded();
    }
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    if (pageNumber === 1) {
      outputScale = pdfOutputScale(
        window.devicePixelRatio,
        viewport.width * viewport.height,
        document.numPages,
      );
    }
    const pageElement = window.document.createElement("div");
    pageElement.className = "pdf-page-wrap";
    pageElement.dataset.page = String(pageNumber);
    pageElement.style.width = `${viewport.width}px`;
    pageElement.style.height = `${viewport.height}px`;
    const canvas = window.document.createElement("canvas");
    canvas.className = "pdf-page";
    // Back the canvas with device pixels so text stays sharp on Retina displays.
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    pageElement.appendChild(canvas);
    container.appendChild(pageElement);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable");
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
    }).promise;
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
    const pageView = {
      element: pageElement,
      overlay,
      text: pageText,
      box: {
        page: pageNumber,
        width: viewport.width / RENDER_SCALE,
        height: viewport.height / RENDER_SCALE,
      },
    };
    overlay.addEventListener("click", (event) => addOperationAt(pageView, event));
    pageElement.appendChild(overlay);
    pages.push(pageView);
    textSignals.push({ page: pageNumber, text: pageText, itemCount });
    if (pageNumber === options?.initialPage) {
      pageElement.scrollIntoView({ block: "start" });
    }
  }
  thumbnailButton.disabled = pages.length === 0;
  renderThumbnailPanel();
  capabilitySummary = summarizePdfCapabilities(textSignals);
  capabilityButton.disabled = capabilitySummary.pages.length === 0;
  capabilityButton.textContent =
    capabilitySummary.hasScannedPages ||
    capabilitySummary.directSimplePages < capabilitySummary.pages.length
      ? "Limits !"
      : "Limits";
  capabilityButton.title = pdfCapabilityMessage(capabilitySummary);
  renderCapabilityPanel();
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
  return {
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
      clear();
      toolbarSize?.disconnect();
      closeOcrReviewPanel();
      closeCapabilityPanel();
      closeThumbnailPanel();
      closeReviewPanel();
      closeProofPanel();
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
