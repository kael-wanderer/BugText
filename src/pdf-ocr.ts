import {
  DEFAULT_PDF_TEXT_STYLE,
  normalizePdfRect,
  type PdfOcrTextBlockOperation,
  type PdfPageBox,
} from "./pdf-edit-document";

export type OcrRawBlock = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export function ocrBlocksToOperations(
  blocks: OcrRawBlock[],
  page: PdfPageBox,
  canvasWidth: number,
  canvasHeight: number,
  idPrefix = "ocr",
): PdfOcrTextBlockOperation[] {
  const scaleX = page.width / Math.max(1, canvasWidth);
  const scaleY = page.height / Math.max(1, canvasHeight);
  return blocks.flatMap((block, index) => {
    const text = block.text.replace(/\s+/g, " ").trim();
    if (!text) return [];
    const x = block.bbox.x0 * scaleX;
    const y = block.bbox.y0 * scaleY;
    const width = (block.bbox.x1 - block.bbox.x0) * scaleX;
    const height = (block.bbox.y1 - block.bbox.y0) * scaleY;
    return [
      {
        id: `${idPrefix}-${index + 1}`,
        type: "ocrTextBlock",
        page: page.page,
        rect: normalizePdfRect({ x, y, width, height }, page),
        text,
        confidence: Math.max(0, Math.min(1, block.confidence / 100)),
      },
    ];
  });
}

export function normalizeOcrLanguage(value: string): string {
  const language = value
    .split("+")
    .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""))
    .filter(Boolean)
    .join("+");
  return language || "eng";
}

type TesseractBlock = {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
};

export async function recognizePdfPageCanvas(
  canvas: HTMLCanvasElement,
  page: PdfPageBox,
  language = "eng",
): Promise<PdfOcrTextBlockOperation[]> {
  const tesseract = await import("tesseract.js");
  // Vendored runtime + language data (npm run vendor:tesseract) so OCR works
  // offline instead of fetching worker/core/traineddata from the CDN.
  const worker = await tesseract.createWorker(normalizeOcrLanguage(language), 1, {
    workerPath: "/vendor/tesseract/worker.min.js",
    corePath: "/vendor/tesseract/tesseract-core-simd-lstm.wasm.js",
    langPath: "/vendor/tesseract/lang",
    gzip: true,
  });
  try {
    const result = await worker.recognize(
      canvas,
      {},
      { blocks: true, text: true },
    );
    const blocks = (result.data.blocks ?? []).flatMap((block: TesseractBlock) => {
      if (!block.text || !block.bbox) return [];
      return [
        {
          text: block.text,
          confidence: block.confidence ?? result.data.confidence ?? 0,
          bbox: block.bbox,
        },
      ];
    });
    if (!blocks.length && result.data.text.trim()) {
      blocks.push({
        text: result.data.text,
        confidence: result.data.confidence ?? 0,
        bbox: { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height },
      });
    }
    return ocrBlocksToOperations(
      blocks,
      page,
      canvas.width,
      canvas.height,
      `ocr-${Date.now().toString(36)}`,
    ).map((operation) => ({
      ...operation,
      // Keep OCR text hidden in the visual editor; it is written as an invisible
      // text layer on export.
      text: operation.text,
    }));
  } finally {
    await worker.terminate();
  }
}

export const OCR_TEXT_STYLE = {
  ...DEFAULT_PDF_TEXT_STYLE,
  opacity: 0,
};
