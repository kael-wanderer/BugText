import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
  type PDFDocument,
  type PDFPage,
} from "pdf-lib";
import type { PdfDirectTextEditOperation, PdfEditDocument } from "./pdf-edit-document";

// Direct text edits for strings the byte-level rewrite cannot read: hex strings
// and two-byte (CID) fonts. Each font's ToUnicode map works in both directions —
// decoding to find the edited text and encoding the replacement — so a letter the
// map lacks (a glyph the embedded font may not have) leaves the edit to the overlay.

type FontCodes = {
  codeBytes: 1 | 2;
  toText: Map<number, string>;
  /** First code for each single character, for encoding replacements. */
  toCode: Map<string, number>;
};

type Token =
  | { kind: "string"; bytes: number[]; start: number; end: number }
  | { kind: "name"; value: string; start: number; end: number }
  | { kind: "number"; start: number; end: number }
  | { kind: "open" | "close"; start: number; end: number }
  | { kind: "operator"; value: string; start: number; end: number };

type TextShow = {
  font: string | undefined;
  strings: number[][];
  /** Byte range replaced by a rewrite: the string, or the whole `[...] TJ`. */
  start: number;
  end: number;
  operator: string;
};

function isSpace(byte: number): boolean {
  return byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32;
}

function isDelimiter(byte: number): boolean {
  return "()<>[]{}/%".includes(String.fromCharCode(byte));
}

function hexValue(byte: number): number {
  if (byte >= 48 && byte <= 57) return byte - 48;
  if (byte >= 65 && byte <= 70) return byte - 55;
  if (byte >= 97 && byte <= 102) return byte - 87;
  return -1;
}

function readLiteral(bytes: Uint8Array, start: number): { bytes: number[]; end: number } | null {
  const out: number[] = [];
  let depth = 1;
  for (let index = start + 1; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === 0x5c) {
      index += 1;
      const escaped = bytes[index];
      const simple: Record<number, number> = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12 };
      if (escaped in simple) out.push(simple[escaped]);
      else if (escaped >= 0x30 && escaped <= 0x37) {
        let value = escaped - 0x30;
        for (let count = 0; count < 2 && bytes[index + 1] >= 0x30 && bytes[index + 1] <= 0x37; count += 1) {
          index += 1;
          value = value * 8 + bytes[index] - 0x30;
        }
        out.push(value & 0xff);
      } else if (escaped === 0x0d) {
        if (bytes[index + 1] === 0x0a) index += 1;
      } else if (escaped !== 0x0a) out.push(escaped);
      continue;
    }
    if (byte === 0x28) depth += 1;
    if (byte === 0x29 && --depth === 0) return { bytes: out, end: index + 1 };
    out.push(byte);
  }
  return null;
}

function readHex(bytes: Uint8Array, start: number): { bytes: number[]; end: number } | null {
  const digits: number[] = [];
  for (let index = start + 1; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === 0x3e) {
      if (digits.length % 2) digits.push(0);
      const out: number[] = [];
      for (let digit = 0; digit < digits.length; digit += 2) out.push(digits[digit] * 16 + digits[digit + 1]);
      return { bytes: out, end: index + 1 };
    }
    if (isSpace(byte)) continue;
    const value = hexValue(byte);
    if (value < 0) return null;
    digits.push(value);
  }
  return null;
}

/** Tokens of a content stream; inline images and dictionaries are skipped over. */
export function contentTokens(bytes: Uint8Array): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < bytes.length) {
    const byte = bytes[index];
    if (isSpace(byte)) {
      index += 1;
    } else if (byte === 0x25) {
      while (index < bytes.length && bytes[index] !== 10 && bytes[index] !== 13) index += 1;
    } else if (byte === 0x28) {
      const literal = readLiteral(bytes, index);
      if (!literal) return tokens;
      tokens.push({ kind: "string", bytes: literal.bytes, start: index, end: literal.end });
      index = literal.end;
    } else if (byte === 0x3c && bytes[index + 1] === 0x3c) {
      tokens.push({ kind: "operator", value: "<<", start: index, end: index + 2 });
      index += 2;
    } else if (byte === 0x3e && bytes[index + 1] === 0x3e) {
      tokens.push({ kind: "operator", value: ">>", start: index, end: index + 2 });
      index += 2;
    } else if (byte === 0x3c) {
      const hex = readHex(bytes, index);
      if (!hex) return tokens;
      tokens.push({ kind: "string", bytes: hex.bytes, start: index, end: hex.end });
      index = hex.end;
    } else if (byte === 0x5b || byte === 0x5d) {
      tokens.push({ kind: byte === 0x5b ? "open" : "close", start: index, end: index + 1 });
      index += 1;
    } else {
      const start = index;
      index += 1;
      while (index < bytes.length && !isSpace(bytes[index]) && !isDelimiter(bytes[index])) index += 1;
      const word = String.fromCharCode(...bytes.subarray(start, index));
      if (byte === 0x2f) tokens.push({ kind: "name", value: word.slice(1), start, end: index });
      else if (/^[-+.\d]/.test(word)) tokens.push({ kind: "number", start, end: index });
      else {
        tokens.push({ kind: "operator", value: word, start, end: index });
        // Inline image data is binary; skip to its end marker.
        if (word === "ID") {
          let stop = index;
          while (stop < bytes.length - 2 && !(isSpace(bytes[stop]) && bytes[stop + 1] === 0x45 && bytes[stop + 2] === 0x49)) stop += 1;
          index = stop + 3;
        }
      }
    }
  }
  return tokens;
}

export function textShows(tokens: Token[]): TextShow[] {
  const shows: TextShow[] = [];
  let font: string | undefined;
  tokens.forEach((token, index) => {
    if (token.kind !== "operator") return;
    if (token.value === "Tf") {
      const name = tokens[index - 2];
      if (name?.kind === "name") font = name.value;
    } else if (token.value === "Tj" || token.value === "'" || token.value === '"') {
      const string = tokens[index - 1];
      if (string?.kind === "string") {
        shows.push({ font, strings: [string.bytes], start: string.start, end: string.end, operator: token.value });
      }
    } else if (token.value === "TJ" && tokens[index - 1]?.kind === "close") {
      let open = index - 2;
      while (open >= 0 && tokens[open].kind !== "open") open -= 1;
      if (open < 0) return;
      const strings = tokens
        .slice(open + 1, index - 1)
        .flatMap((item) => (item.kind === "string" ? [item.bytes] : []));
      shows.push({ font, strings, start: tokens[open].start, end: token.end, operator: "TJ" });
    }
  });
  return shows;
}

function utf16(bytes: number[]): string {
  let text = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
  }
  return text;
}

function hexBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  return bytes;
}

function hexNumber(hex: string): number {
  return Number.parseInt(hex, 16);
}

/** Code-to-text pairs from a ToUnicode CMap (`bfchar` and `bfrange` sections). */
export function parseToUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const section of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of section[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(hexNumber(pair[1]), utf16(hexBytes(pair[2])));
    }
  }
  for (const section of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = section[1];
    for (const range of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const low = hexNumber(range[1]);
      const high = hexNumber(range[2]);
      if (high - low > 0xffff) continue;
      if (range[3].startsWith("[")) {
        [...range[3].matchAll(/<([0-9a-fA-F]*)>/g)].forEach((item, offset) => {
          if (low + offset <= high) map.set(low + offset, utf16(hexBytes(item[1])));
        });
      } else {
        const start = hexBytes(range[3].slice(1, -1));
        for (let code = low; code <= high; code += 1) {
          const bytes = [...start];
          // The last UTF-16 unit counts up across the range.
          const last = ((bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1]) + (code - low);
          bytes[bytes.length - 2] = (last >> 8) & 0xff;
          bytes[bytes.length - 1] = last & 0xff;
          map.set(code, utf16(bytes));
        }
      }
    }
  }
  return map;
}

function streamBytes(pdf: PDFDocument, value: unknown): Uint8Array | null {
  const stream = value instanceof PDFRef ? pdf.context.lookup(value) : value;
  if (!(stream instanceof PDFRawStream)) return null;
  try {
    return decodePDFRawStream(stream).decode();
  } catch {
    return null;
  }
}

function fontCodes(pdf: PDFDocument, font: PDFDict): FontCodes | null {
  const cmap = streamBytes(pdf, font.get(PDFName.of("ToUnicode")));
  if (!cmap) return null;
  const subtype = font.get(PDFName.of("Subtype"));
  let codeBytes: 1 | 2 = 1;
  if (subtype === PDFName.of("Type0")) {
    // Only the identity encodings have a fixed two-byte code.
    const encoding = font.get(PDFName.of("Encoding"));
    if (encoding !== PDFName.of("Identity-H") && encoding !== PDFName.of("Identity-V")) return null;
    codeBytes = 2;
  }
  const toText = parseToUnicode(String.fromCharCode(...cmap));
  const toCode = new Map<string, number>();
  for (const [code, text] of toText) {
    if ([...text].length === 1 && !toCode.has(text)) toCode.set(text, code);
  }
  return { codeBytes, toText, toCode };
}

function pageFonts(pdf: PDFDocument, page: PDFPage): Map<string, FontCodes> {
  const fonts = new Map<string, FontCodes>();
  const dict = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
  for (const [name, value] of dict?.entries() ?? []) {
    const font = pdf.context.lookup(value);
    const codes = font instanceof PDFDict ? fontCodes(pdf, font) : null;
    if (codes) fonts.set(name.decodeText(), codes);
  }
  return fonts;
}

function decodeShow(show: TextShow, font: FontCodes): string | null {
  let text = "";
  for (const bytes of show.strings) {
    if (bytes.length % font.codeBytes) return null;
    for (let index = 0; index < bytes.length; index += font.codeBytes) {
      const code = font.codeBytes === 2 ? (bytes[index] << 8) | bytes[index + 1] : bytes[index];
      const part = font.toText.get(code);
      if (part === undefined) return null;
      text += part;
    }
  }
  return text;
}

function encodeText(text: string, font: FontCodes): string | null {
  let hex = "";
  for (const character of text) {
    const code = font.toCode.get(character);
    if (code === undefined) return null;
    hex += code.toString(16).padStart(font.codeBytes * 2, "0");
  }
  return hex;
}

function pageContents(pdf: PDFDocument, page: PDFPage): PDFRef[] {
  const contents = page.node.get(PDFName.of("Contents"));
  const resolved = contents instanceof PDFRef ? pdf.context.lookup(contents) : contents;
  if (resolved instanceof PDFArray) {
    return resolved.asArray().flatMap((item) => (item instanceof PDFRef ? [item] : []));
  }
  return contents instanceof PDFRef ? [contents] : [];
}

function rewriteOnPage(pdf: PDFDocument, operation: PdfDirectTextEditOperation): boolean {
  const page = pdf.getPages()[operation.page - 1];
  if (!page) return false;
  const fonts = pageFonts(pdf, page);
  if (!fonts.size) return false;
  const matches: Array<{ ref: PDFRef; content: Uint8Array; show: TextShow; font: FontCodes }> = [];
  for (const ref of pageContents(pdf, page)) {
    const content = streamBytes(pdf, ref);
    if (!content) continue;
    for (const show of textShows(contentTokens(content))) {
      const font = show.font ? fonts.get(show.font) : undefined;
      if (font && decodeShow(show, font) === operation.originalText) matches.push({ ref, content, show, font });
    }
  }
  // Same rule as the byte-level rewrite: exactly one place on the page.
  if (matches.length !== 1) return false;
  const [{ ref, content, show, font }] = matches;
  // Keep the text's footprint: never longer, padded with spaces when shorter.
  const original = [...operation.originalText].length;
  const replacement = [...operation.replacementText];
  if (replacement.length > original) return false;
  const padded =
    replacement.length < original && font.toCode.has(" ")
      ? replacement.join("") + " ".repeat(original - replacement.length)
      : replacement.join("");
  const hex = encodeText(padded, font);
  if (hex === null) return false;
  const swap = show.operator === "TJ" ? `<${hex}> Tj` : `<${hex}>`;
  const next = new Uint8Array(content.length - (show.end - show.start) + swap.length);
  next.set(content.subarray(0, show.start), 0);
  for (let index = 0; index < swap.length; index += 1) next[show.start + index] = swap.charCodeAt(index);
  next.set(content.subarray(show.end), show.start + swap.length);
  pdf.context.assign(ref, pdf.context.flateStream(next));
  return true;
}

/** Applies direct edits the byte-level rewrite skipped; returns the ids it applied. */
export function tryFontAwareRewrite(
  pdf: PDFDocument,
  edits: PdfEditDocument,
  skippedIds: ReadonlySet<string>,
): Set<string> {
  const applied = new Set<string>();
  for (const page of edits.pages) {
    for (const operation of page.operations) {
      if (operation.type !== "directTextEdit" || !skippedIds.has(operation.id)) continue;
      if (!operation.originalText || operation.originalText === operation.replacementText) continue;
      try {
        if (rewriteOnPage(pdf, operation)) applied.add(operation.id);
      } catch {
        // Unreadable structures leave the edit to the overlay.
      }
    }
  }
  return applied;
}
