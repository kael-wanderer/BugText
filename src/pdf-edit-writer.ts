import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
  type RGB,
} from "pdf-lib";
import {
  DEFAULT_PDF_TEXT_STYLE,
  normalizePdfRect,
  pdfEditOperationsForPage,
  type PdfEditDocument,
  type PdfEditOperation,
  type PdfRect,
  type PdfTextStyle,
} from "./pdf-edit-document";
import { tryDirectTextRewrite } from "./pdf-direct-rewrite";
import { pdfStandardFontMatch } from "./pdf-font-inspection";
import {
  createPdfPageFrame,
  frameRectToPdf,
  visiblePdfBounds,
  type PdfPageFrame,
} from "./pdf-page-frame";
import {
  PDF_SYSTEM_FONT_DIR,
  missingCharacters,
  unicodeFontFilesFor,
  unsupportedCharactersMessage,
  type PdfFontBytesLoader,
} from "./pdf-unicode-fonts";

type WriterContext = {
  pdf: PDFDocument;
  standardFonts: Partial<Record<StandardFonts, PDFFont>>;
  /** Embedded system fonts by file name; null when the file could not be read. */
  systemFonts: Map<string, PDFFont | null>;
  characterSets: Map<PDFFont, Set<number>>;
  images: Record<string, PDFImage>;
  loadFontBytes?: PdfFontBytesLoader;
};

export function pdfEditColor(value: string): RGB {
  const hex = value.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return rgb(0, 0, 0);
  const int = Number.parseInt(match[1], 16);
  return rgb(
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  );
}

export function standardFontFor(style: PdfTextStyle): StandardFonts {
  const standardMatch = pdfStandardFontMatch(style.fontFamily);
  if (standardMatch === "Courier") {
    if (style.bold && style.italic) return StandardFonts.CourierBoldOblique;
    if (style.bold) return StandardFonts.CourierBold;
    if (style.italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (standardMatch === "Times") {
    if (style.bold && style.italic) return StandardFonts.TimesRomanBoldItalic;
    if (style.bold) return StandardFonts.TimesRomanBold;
    if (style.italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (standardMatch === "Helvetica") {
    if (style.bold && style.italic) return StandardFonts.HelveticaBoldOblique;
    if (style.bold) return StandardFonts.HelveticaBold;
    if (style.italic) return StandardFonts.HelveticaOblique;
    return StandardFonts.Helvetica;
  }
  const family = style.fontFamily.toLowerCase();
  if (family.includes("courier") || family.includes("mono")) {
    if (style.bold && style.italic) return StandardFonts.CourierBoldOblique;
    if (style.bold) return StandardFonts.CourierBold;
    if (style.italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (family.includes("times") || family.includes("serif")) {
    if (style.bold && style.italic) return StandardFonts.TimesRomanBoldItalic;
    if (style.bold) return StandardFonts.TimesRomanBold;
    if (style.italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (style.bold && style.italic) return StandardFonts.HelveticaBoldOblique;
  if (style.bold) return StandardFonts.HelveticaBold;
  if (style.italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

async function embedStandardFont(context: WriterContext, name: StandardFonts): Promise<PDFFont> {
  context.standardFonts[name] = context.standardFonts[name] ?? (await context.pdf.embedFont(name));
  return context.standardFonts[name];
}

async function embedSystemFont(context: WriterContext, file: string): Promise<PDFFont | null> {
  if (context.systemFonts.has(file)) return context.systemFonts.get(file)!;
  const bytes = await context.loadFontBytes?.(`${PDF_SYSTEM_FONT_DIR}${file}`);
  let font: PDFFont | null = null;
  if (bytes?.length) {
    try {
      // fontkit is large and only Unicode text needs it, so it loads on first use.
      const { default: fontkit } = await import("@pdf-lib/fontkit");
      context.pdf.registerFontkit(fontkit);
      font = await context.pdf.embedFont(bytes, { subset: true });
    } catch {
      font = null;
    }
  }
  context.systemFonts.set(file, font);
  return font;
}

function characterSet(context: WriterContext, font: PDFFont): Set<number> {
  let set = context.characterSets.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    context.characterSets.set(font, set);
  }
  return set;
}

function standardFontEncodes(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

// The standard font when it can encode the text, so Western text saves exactly
// as before; otherwise the matching system face, then the Unicode fallback.
async function fontForText(
  context: WriterContext,
  style: PdfTextStyle,
  text: string,
): Promise<PDFFont> {
  const name = standardFontFor(style);
  const standard = await embedStandardFont(context, name);
  if (standardFontEncodes(standard, text.replace(/\s+/g, " "))) return standard;
  let missing = [...new Set(text)].filter(
    (character) => !/\s/.test(character) && !standardFontEncodes(standard, character),
  );
  for (const file of unicodeFontFilesFor(name)) {
    const font = await embedSystemFont(context, file);
    if (!font) continue;
    const lacking = missingCharacters(text, characterSet(context, font));
    if (!lacking.length) return font;
    missing = lacking;
  }
  throw new Error(unsupportedCharactersMessage(missing));
}

function drawCover(
  page: PDFPage,
  frame: PdfPageFrame,
  rect: PdfRect,
  color: string,
  opacity: number,
): void {
  page.drawRectangle({
    ...frameRectToPdf(frame, normalizePdfRect(rect, frame.box)),
    color: pdfEditColor(color),
    opacity,
    borderOpacity: 0,
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
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

async function drawTextBox(
  context: WriterContext,
  page: PDFPage,
  frame: PdfPageFrame,
  rect: PdfRect,
  text: string,
  style: PdfTextStyle,
): Promise<void> {
  const font = await fontForText(context, style, text);
  const box = normalizePdfRect(rect, frame.box);
  const lineHeight = style.fontSize * 1.25;
  const lines = wrapText(text, font, style.fontSize, box.width);
  const maxLines = Math.max(1, Math.floor(box.height / lineHeight));
  const visibleLines = lines.slice(0, maxLines);

  // Lay lines out on screen, then map each baseline start into user space and
  // turn the text with the page so it reads upright on rotated pages.
  visibleLines.forEach((line, index) => {
    const spare = Math.max(0, box.width - font.widthOfTextAtSize(line, style.fontSize));
    const offset = style.align === "right" ? spare : style.align === "center" ? spare / 2 : 0;
    const origin = frame.toPdf(box.x + offset, box.y + style.fontSize + index * lineHeight);
    page.drawText(line, {
      x: origin.x,
      y: origin.y,
      size: style.fontSize,
      font,
      color: pdfEditColor(style.color),
      opacity: style.opacity,
      rotate: degrees(frame.rotation),
    });
  });
}

async function applyOperation(
  context: WriterContext,
  page: PDFPage,
  frame: PdfPageFrame,
  operation: PdfEditOperation,
  directAppliedIds: Set<string>,
): Promise<void> {
  if (operation.type === "directTextEdit") {
    if (directAppliedIds.has(operation.id)) return;
    (operation.fallbackCoverRects ?? [operation.rect]).forEach((rect) => {
      drawCover(page, frame, rect, "#ffffff", 1);
    });
    await drawTextBox(
      context,
      page,
      frame,
      operation.rect,
      operation.replacementText,
      operation.fallbackStyle ?? DEFAULT_PDF_TEXT_STYLE,
    );
    return;
  }
  if (operation.type === "coverPatch") {
    drawCover(page, frame, operation.rect, operation.color, operation.opacity);
    return;
  }
  if (operation.type === "textBox") {
    await drawTextBox(context, page, frame, operation.rect, operation.text, operation.style);
    return;
  }
  if (operation.type === "replacementText") {
    (operation.cover.rects ?? [operation.cover.rect]).forEach((rect) => {
      drawCover(page, frame, rect, operation.cover.color, operation.cover.opacity);
    });
    await drawTextBox(
      context,
      page,
      frame,
      operation.text.rect,
      operation.text.value,
      operation.text.style,
    );
    return;
  }
  if (operation.type === "imageBox") {
    const imageKey = operation.id;
    context.images[imageKey] =
      context.images[imageKey] ??
      (operation.mimeType === "image/png"
        ? await context.pdf.embedPng(new Uint8Array(operation.bytes))
        : await context.pdf.embedJpg(new Uint8Array(operation.bytes)));
    const box = normalizePdfRect(operation.rect, frame.box);
    // drawImage anchors at the image's bottom-left as shown, then turns with the page.
    const origin = frame.toPdf(box.x, box.y + box.height);
    page.drawImage(context.images[imageKey], {
      x: origin.x,
      y: origin.y,
      width: box.width,
      height: box.height,
      rotate: degrees(frame.rotation),
    });
    return;
  }
  if (operation.type === "ocrTextBlock") {
    await drawTextBox(
      context,
      page,
      frame,
      operation.rect,
      operation.text,
      { ...DEFAULT_PDF_TEXT_STYLE, opacity: 0 },
    );
  }
}

export async function writeEditedPdf(
  originalBytes: Uint8Array,
  edits: PdfEditDocument,
  loadFontBytes?: PdfFontBytesLoader,
): Promise<Uint8Array> {
  const directRewrite = tryDirectTextRewrite(originalBytes, edits);
  const pdf = await PDFDocument.load(directRewrite.bytes);
  const context: WriterContext = {
    pdf,
    standardFonts: {},
    systemFonts: new Map(),
    characterSets: new Map(),
    images: {},
    loadFontBytes,
  };

  for (const [index, page] of pdf.getPages().entries()) {
    // Edits are placed on the page as the editor shows it: cropped and rotated.
    const frame = createPdfPageFrame(
      index + 1,
      visiblePdfBounds(page.getCropBox(), page.getMediaBox()),
      page.getRotation().angle,
    );
    for (const operation of pdfEditOperationsForPage(edits, frame.box.page)) {
      await applyOperation(context, page, frame, operation, directRewrite.appliedIds);
    }
  }

  return pdf.save();
}
