export type PdfRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfPageBox = {
  page: number;
  width: number;
  height: number;
};

export type PdfTextStyle = {
  fontFamily: string;
  fontSize: number;
  color: string;
  opacity: number;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
};

export type PdfTextBoxOperation = {
  id: string;
  type: "textBox";
  page: number;
  rect: PdfRect;
  text: string;
  style: PdfTextStyle;
};

export type PdfCoverPatchOperation = {
  id: string;
  type: "coverPatch";
  page: number;
  rect: PdfRect;
  color: string;
  opacity: number;
};

export type PdfReplacementTextOperation = {
  id: string;
  type: "replacementText";
  page: number;
  sourceText: string;
  cover: {
    rect: PdfRect;
    rects?: PdfRect[];
    color: string;
    opacity: number;
  };
  text: {
    rect: PdfRect;
    value: string;
    style: PdfTextStyle;
  };
};

export type PdfDirectTextEditOperation = {
  id: string;
  type: "directTextEdit";
  page: number;
  sourceId: string;
  originalText: string;
  replacementText: string;
  rect: PdfRect;
  fallbackCoverRects?: PdfRect[];
  fallbackStyle?: PdfTextStyle;
};

export type PdfOcrTextBlockOperation = {
  id: string;
  type: "ocrTextBlock";
  page: number;
  rect: PdfRect;
  text: string;
  confidence: number;
};

export type PdfImageBoxOperation = {
  id: string;
  type: "imageBox";
  page: number;
  rect: PdfRect;
  name: string;
  mimeType: "image/png" | "image/jpeg";
  bytes: number[];
};

export type PdfEditOperation =
  | PdfTextBoxOperation
  | PdfCoverPatchOperation
  | PdfReplacementTextOperation
  | PdfDirectTextEditOperation
  | PdfOcrTextBlockOperation
  | PdfImageBoxOperation;

export type PdfEditPage = {
  page: number;
  width: number;
  height: number;
  operations: PdfEditOperation[];
};

export type PdfEditDocument = {
  version: 1;
  sourceFingerprint: string;
  /** SHA-256 of the PDF bytes the edits were made on; absent in older drafts. */
  sourceDigest?: string;
  pages: PdfEditPage[];
};

export type PdfWriterRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const DEFAULT_PDF_TEXT_STYLE: PdfTextStyle = {
  fontFamily: "Helvetica",
  fontSize: 14,
  color: "#111111",
  opacity: 1,
  bold: false,
  italic: false,
  align: "left",
};

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function bytesToBase64(bytes: number[]): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): number[] | null {
  try {
    const binary = atob(value);
    return Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

// Image bytes are stored as base64 (older drafts used a JSON number array).
function parseByteArray(value: unknown): number[] | null {
  if (typeof value === "string") {
    const bytes = base64ToBytes(value);
    return bytes?.length ? bytes : null;
  }
  if (!Array.isArray(value)) return null;
  const bytes = value.flatMap((item) => {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item > 255) {
      return [];
    }
    return [item];
  });
  return bytes.length === value.length && bytes.length > 0 ? bytes : null;
}

function parseRect(value: unknown): PdfRect | null {
  const obj = plainObject(value);
  if (!obj) return null;
  const x = finiteNumber(obj.x);
  const y = finiteNumber(obj.y);
  const width = finiteNumber(obj.width);
  const height = finiteNumber(obj.height);
  if (x === null || y === null || width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function parseRects(value: unknown): PdfRect[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rects = value.flatMap((item) => {
    const rect = parseRect(item);
    return rect ? [rect] : [];
  });
  return rects.length === value.length && rects.length > 0 ? rects : undefined;
}

function parseStyle(value: unknown): PdfTextStyle {
  const obj = plainObject(value) ?? {};
  const align = obj.align;
  return {
    ...DEFAULT_PDF_TEXT_STYLE,
    fontFamily: nonEmptyString(obj.fontFamily) ?? DEFAULT_PDF_TEXT_STYLE.fontFamily,
    fontSize:
      finiteNumber(obj.fontSize) && Number(obj.fontSize) > 0
        ? Number(obj.fontSize)
        : DEFAULT_PDF_TEXT_STYLE.fontSize,
    color: nonEmptyString(obj.color) ?? DEFAULT_PDF_TEXT_STYLE.color,
    opacity: clampOpacity(finiteNumber(obj.opacity) ?? DEFAULT_PDF_TEXT_STYLE.opacity),
    bold: typeof obj.bold === "boolean" ? obj.bold : DEFAULT_PDF_TEXT_STYLE.bold,
    italic:
      typeof obj.italic === "boolean" ? obj.italic : DEFAULT_PDF_TEXT_STYLE.italic,
    align:
      align === "center" || align === "right" || align === "left"
        ? align
        : DEFAULT_PDF_TEXT_STYLE.align,
  };
}

function parseOperation(value: unknown): PdfEditOperation | null {
  const obj = plainObject(value);
  if (!obj) return null;
  const id = nonEmptyString(obj.id);
  const page = finiteNumber(obj.page);
  if (!id || page === null || page < 1) return null;

  if (obj.type === "textBox") {
    const rect = parseRect(obj.rect);
    if (!rect || typeof obj.text !== "string") return null;
    return { id, type: "textBox", page, rect, text: obj.text, style: parseStyle(obj.style) };
  }

  if (obj.type === "coverPatch") {
    const rect = parseRect(obj.rect);
    if (!rect) return null;
    return {
      id,
      type: "coverPatch",
      page,
      rect,
      color: nonEmptyString(obj.color) ?? "#ffffff",
      opacity: clampOpacity(finiteNumber(obj.opacity) ?? 1),
    };
  }

  if (obj.type === "replacementText") {
    const cover = plainObject(obj.cover);
    const text = plainObject(obj.text);
    const coverRect = parseRect(cover?.rect);
    const textRect = parseRect(text?.rect);
    if (!cover || !text || !coverRect || !textRect || typeof text.value !== "string") {
      return null;
    }
    return {
      id,
      type: "replacementText",
      page,
      sourceText: typeof obj.sourceText === "string" ? obj.sourceText : "",
      cover: {
        rect: coverRect,
        rects: parseRects(cover.rects),
        color: nonEmptyString(cover.color) ?? "#ffffff",
        opacity: clampOpacity(finiteNumber(cover.opacity) ?? 1),
      },
      text: {
        rect: textRect,
        value: text.value,
        style: parseStyle(text.style),
      },
    };
  }

  if (obj.type === "directTextEdit") {
    const rect = parseRect(obj.rect);
    if (
      !rect ||
      typeof obj.sourceId !== "string" ||
      typeof obj.originalText !== "string" ||
      typeof obj.replacementText !== "string"
    ) {
      return null;
    }
    return {
      id,
      type: "directTextEdit",
      page,
      sourceId: obj.sourceId,
      originalText: obj.originalText,
      replacementText: obj.replacementText,
      rect,
      fallbackCoverRects: parseRects(obj.fallbackCoverRects),
      fallbackStyle: obj.fallbackStyle ? parseStyle(obj.fallbackStyle) : undefined,
    };
  }

  if (obj.type === "ocrTextBlock") {
    const rect = parseRect(obj.rect);
    if (!rect || typeof obj.text !== "string") return null;
    return {
      id,
      type: "ocrTextBlock",
      page,
      rect,
      text: obj.text,
      confidence: Math.max(0, Math.min(1, finiteNumber(obj.confidence) ?? 0)),
    };
  }

  if (obj.type === "imageBox") {
    const rect = parseRect(obj.rect);
    const bytes = parseByteArray(obj.bytes);
    const mimeType = obj.mimeType;
    if (!rect || !bytes || (mimeType !== "image/png" && mimeType !== "image/jpeg")) {
      return null;
    }
    return {
      id,
      type: "imageBox",
      page,
      rect,
      name: nonEmptyString(obj.name) ?? "Image",
      mimeType,
      bytes,
    };
  }

  return null;
}

function parsePage(value: unknown): PdfEditPage | null {
  const obj = plainObject(value);
  if (!obj) return null;
  const page = finiteNumber(obj.page);
  const width = finiteNumber(obj.width);
  const height = finiteNumber(obj.height);
  if (page === null || width === null || height === null) return null;
  if (page < 1 || width <= 0 || height <= 0) return null;
  const operations = Array.isArray(obj.operations)
    ? obj.operations.flatMap((item) => {
        const op = parseOperation(item);
        return op && op.page === page ? [op] : [];
      })
    : [];
  return { page, width, height, operations };
}

export function clampOpacity(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createPdfEditDocument(sourceFingerprint: string): PdfEditDocument {
  return {
    version: 1,
    sourceFingerprint,
    pages: [],
  };
}

export function parsePdfEditDocument(raw: string): PdfEditDocument {
  if (!raw.trim()) return createPdfEditDocument("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("This file does not contain valid PDF edit data.");
  }

  const obj = plainObject(parsed);
  if (!obj || obj.version !== 1 || typeof obj.sourceFingerprint !== "string") {
    throw new Error("This file does not contain valid PDF edit data.");
  }

  return {
    version: 1,
    sourceFingerprint: obj.sourceFingerprint,
    ...(typeof obj.sourceDigest === "string" ? { sourceDigest: obj.sourceDigest } : {}),
    pages: Array.isArray(obj.pages) ? obj.pages.flatMap((page) => {
      const parsedPage = parsePage(page);
      return parsedPage ? [parsedPage] : [];
    }) : [],
  };
}

/** Hex SHA-256 of PDF bytes, used to tell whether a draft belongs to the file on disk. */
export async function pdfSourceDigest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** True when a draft with edits was made on different bytes than `digest`. */
export function pdfDraftIsStale(document: PdfEditDocument, digest: string): boolean {
  return hasPdfEdits(document) && !!document.sourceDigest && document.sourceDigest !== digest;
}

// Compact, with image bytes as base64: a number array takes about three times the
// space, and drafts live in browser storage with a small quota.
export function serializePdfEditDocument(document: PdfEditDocument): string {
  return JSON.stringify(document, (key, value: unknown) =>
    key === "bytes" && Array.isArray(value) ? bytesToBase64(value as number[]) : value,
  );
}

export function pageBox(page: PdfEditPage | PdfPageBox): PdfPageBox {
  return { page: page.page, width: page.width, height: page.height };
}

export function normalizePdfRect(rect: PdfRect, page: PdfPageBox): PdfRect {
  const width = Math.min(Math.max(1, rect.width), page.width);
  const height = Math.min(Math.max(1, rect.height), page.height);
  const x = Math.max(0, Math.min(rect.x, page.width - width));
  const y = Math.max(0, Math.min(rect.y, page.height - height));
  return { x, y, width, height };
}

export function snapPdfRect(
  rect: PdfRect,
  page: PdfPageBox,
  gridSize = 5,
): PdfRect {
  const grid = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 5;
  const snap = (value: number): number => Math.round(value / grid) * grid;
  return normalizePdfRect(
    {
      x: snap(rect.x),
      y: snap(rect.y),
      width: Math.max(grid, snap(rect.width)),
      height: Math.max(grid, snap(rect.height)),
    },
    page,
  );
}

export function pdfUiRectToWriterRect(
  rect: PdfRect,
  page: PdfPageBox,
): PdfWriterRect {
  const normalized = normalizePdfRect(rect, page);
  return {
    x: normalized.x,
    y: page.height - normalized.y - normalized.height,
    width: normalized.width,
    height: normalized.height,
  };
}

export function upsertPdfPage(
  document: PdfEditDocument,
  page: PdfPageBox,
): PdfEditDocument {
  const existing = document.pages.find((item) => item.page === page.page);
  const nextPage: PdfEditPage = existing
    ? { ...existing, width: page.width, height: page.height }
    : { ...page, operations: [] };
  const pages = [
    ...document.pages.filter((item) => item.page !== page.page),
    nextPage,
  ].sort((a, b) => a.page - b.page);
  return { ...document, pages };
}

export function addPdfEditOperation(
  document: PdfEditDocument,
  page: PdfPageBox,
  operation: PdfEditOperation,
): PdfEditDocument {
  const withPage = upsertPdfPage(document, page);
  return {
    ...withPage,
    pages: withPage.pages.map((item) =>
      item.page === page.page
        ? {
            ...item,
            operations: [
              ...item.operations.filter((op) => op.id !== operation.id),
              operation,
            ],
          }
        : item,
    ),
  };
}

export function removePdfEditOperation(
  document: PdfEditDocument,
  operationId: string,
): PdfEditDocument {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      operations: page.operations.filter((operation) => operation.id !== operationId),
    })),
  };
}

export function pdfEditOperationsForPage(
  document: PdfEditDocument,
  page: number,
): PdfEditOperation[] {
  return document.pages.find((item) => item.page === page)?.operations ?? [];
}

export function hasPdfEdits(document: PdfEditDocument): boolean {
  return document.pages.some((page) => page.operations.length > 0);
}
