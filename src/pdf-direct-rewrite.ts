import { deflate, inflate } from "pako";
import type { PdfDirectTextEditOperation, PdfEditDocument } from "./pdf-edit-document";

export type PdfDirectRewriteResult = {
  bytes: Uint8Array;
  appliedIds: Set<string>;
  skippedIds: Set<string>;
};

/** Where one page's text lives, from the parsed document. */
export type PdfRewritePageScope = {
  /** Object numbers of the page's content streams. */
  contentObjects: ReadonlySet<number>;
  /** Font resource names (without the slash) whose embedded font is a subset. */
  subsetFonts: ReadonlySet<string>;
};

type LiteralRange = {
  contentStart: number;
  contentEnd: number;
  decoded: string;
  textShowing: boolean;
};

type ParsedLiteralRange = LiteralRange & {
  closingParen: number;
};

type TextShowingMatch = {
  decoded: string;
  spans: Array<Pick<LiteralRange, "contentStart" | "contentEnd">>;
};

type RewriteCandidate = (
  | {
      kind: "raw";
      match: TextShowingMatch;
    }
  | {
      kind: "flate";
      stream: FlateStreamRange;
      decodedBytes: Uint8Array;
      match: TextShowingMatch;
    }
) & {
  /** Font resource selected where the text is shown; known only for page-scoped search. */
  font?: string;
};

type PageStream = {
  /** Decoded content bytes; offsets in matches are relative to these. */
  content: Uint8Array;
  /** Where `content` starts in the file for an unfiltered stream; null when compressed. */
  fileOffset: number | null;
  flate: FlateStreamRange | null;
};

type FlateStreamRange = {
  objectNumber: number | null;
  dictionaryStart: number;
  dictionaryEnd: number;
  lengthStart: number;
  lengthEnd: number;
  streamStart: number;
  streamEnd: number;
};

function isWhitespace(byte: number): boolean {
  return byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32;
}

function decodeLiteral(bytes: Uint8Array, start: number, end: number): string | null {
  let out = "";
  for (let index = start; index < end; index += 1) {
    const byte = bytes[index];
    if (byte === 0x5c) {
      index += 1;
      if (index >= end) return null;
      const escaped = bytes[index];
      if (escaped === 0x6e) out += "\n";
      else if (escaped === 0x72) out += "\r";
      else if (escaped === 0x74) out += "\t";
      else if (escaped === 0x62) out += "\b";
      else if (escaped === 0x66) out += "\f";
      else if (escaped === 0x28 || escaped === 0x29 || escaped === 0x5c) {
        out += String.fromCharCode(escaped);
      } else if (escaped >= 0x30 && escaped <= 0x37) {
        let octal = String.fromCharCode(escaped);
        for (let count = 0; count < 2 && index + 1 < end; count += 1) {
          const next = bytes[index + 1];
          if (next < 0x30 || next > 0x37) break;
          index += 1;
          octal += String.fromCharCode(next);
        }
        out += String.fromCharCode(Number.parseInt(octal, 8));
      } else if (escaped === 0x0d && bytes[index + 1] === 0x0a) {
        index += 1;
      } else if (escaped === 0x0a || escaped === 0x0d) {
        // Line continuation.
      } else {
        out += String.fromCharCode(escaped);
      }
    } else if (byte > 0x7f) {
      return null;
    } else {
      out += String.fromCharCode(byte);
    }
  }
  return out;
}

function encodeLiteralContent(text: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code > 0x7f) return null;
    if (char === "\\" || char === "(" || char === ")") {
      bytes.push(0x5c, code);
    } else if (char === "\n") {
      bytes.push(0x5c, 0x6e);
    } else if (char === "\r") {
      bytes.push(0x5c, 0x72);
    } else if (char === "\t") {
      bytes.push(0x5c, 0x74);
    } else if (code < 0x20) {
      return null;
    } else {
      bytes.push(code);
    }
  }
  return Uint8Array.from(bytes);
}

function singleTextShowingAfterLiteral(bytes: Uint8Array, closingParen: number): boolean {
  let index = closingParen + 1;
  while (index < bytes.length && isWhitespace(bytes[index])) index += 1;
  if (bytes[index] === 0x54 && bytes[index + 1] === 0x6a) return true;
  if (bytes[index] === 0x27 || bytes[index] === 0x22) return true;
  return false;
}

function arrayTextShowingAfter(bytes: Uint8Array, closingBracket: number): boolean {
  let index = closingBracket + 1;
  while (index < bytes.length && isWhitespace(bytes[index])) index += 1;
  return bytes[index] === 0x54 && bytes[index + 1] === 0x4a;
}

function parseLiteralAt(bytes: Uint8Array, openingParen: number): ParsedLiteralRange | null {
  const contentStart = openingParen + 1;
  let depth = 1;
  for (let cursor = contentStart; cursor < bytes.length; cursor += 1) {
    const byte = bytes[cursor];
    if (byte === 0x5c) {
      cursor += 1;
      continue;
    }
    if (byte === 0x28) depth += 1;
    if (byte === 0x29) depth -= 1;
    if (depth === 0) {
      const decoded = decodeLiteral(bytes, contentStart, cursor);
      if (decoded === null) return null;
      return {
        contentStart,
        contentEnd: cursor,
        decoded,
        textShowing: singleTextShowingAfterLiteral(bytes, cursor),
        closingParen: cursor,
      };
    }
  }
  return null;
}

export function pdfLiteralRanges(bytes: Uint8Array): LiteralRange[] {
  const ranges: LiteralRange[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x28) continue;
    const parsed = parseLiteralAt(bytes, index);
    if (parsed) {
      const { closingParen: _closingParen, ...range } = parsed;
      ranges.push(range);
      index = parsed.closingParen;
    }
  }
  return ranges;
}

function arrayTextShowingMatches(bytes: Uint8Array): TextShowingMatch[] {
  const matches: TextShowingMatch[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x5b) continue;
    let cursor = index + 1;
    const literals: ParsedLiteralRange[] = [];
    let closingBracket: number | null = null;
    while (cursor < bytes.length) {
      const byte = bytes[cursor];
      if (byte === 0x28) {
        const parsed = parseLiteralAt(bytes, cursor);
        if (!parsed) break;
        literals.push(parsed);
        cursor = parsed.closingParen + 1;
        continue;
      }
      if (byte === 0x5d) {
        closingBracket = cursor;
        break;
      }
      cursor += 1;
    }
    if (closingBracket === null) continue;
    if (literals.length > 0 && arrayTextShowingAfter(bytes, closingBracket)) {
      matches.push({
        decoded: literals.map((literal) => literal.decoded).join(""),
        spans: literals.map((literal) => ({
          contentStart: literal.contentStart,
          contentEnd: literal.contentEnd,
        })),
      });
    }
    index = closingBracket;
  }
  return matches;
}

function directTextShowingMatches(bytes: Uint8Array): TextShowingMatch[] {
  const singles = pdfLiteralRanges(bytes)
    .filter((range) => range.textShowing)
    .map((range) => ({
      decoded: range.decoded,
      spans: [{ contentStart: range.contentStart, contentEnd: range.contentEnd }],
    }));
  return [...singles, ...arrayTextShowingMatches(bytes)];
}

function ascii(bytes: Uint8Array, start = 0, end = bytes.length): string {
  let out = "";
  for (let index = start; index < end; index += 1) {
    out += String.fromCharCode(bytes[index]);
  }
  return out;
}

function findAscii(bytes: Uint8Array, needle: string, from: number): number {
  const codes = [...needle].map((char) => char.charCodeAt(0));
  for (let index = from; index <= bytes.length - codes.length; index += 1) {
    let match = true;
    for (let offset = 0; offset < codes.length; offset += 1) {
      if (bytes[index + offset] !== codes[offset]) {
        match = false;
        break;
      }
    }
    if (match) return index;
  }
  return -1;
}

function streamDataStart(bytes: Uint8Array, streamKeyword: number): number {
  let index = streamKeyword + "stream".length;
  if (bytes[index] === 0x0d && bytes[index + 1] === 0x0a) return index + 2;
  if (bytes[index] === 0x0a || bytes[index] === 0x0d) return index + 1;
  return index;
}

function directLengthRange(dictionary: string): { start: number; end: number } | null {
  const match = /\/Length\s+(\d+)/.exec(dictionary);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].lastIndexOf(match[1]);
  return { start, end: start + match[1].length };
}

function hasOnlyFlateDecodeFilter(dictionary: string): boolean {
  return /\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])/.test(dictionary);
}

function objectNumberBefore(bytes: Uint8Array, dictionaryStart: number): number | null {
  const header = /(\d+)\s+\d+\s+obj\s*$/.exec(
    ascii(bytes, Math.max(0, dictionaryStart - 32), dictionaryStart),
  );
  return header ? Number(header[1]) : null;
}

type StreamRange = FlateStreamRange & { filter: "flate" | "none" | "other" };

function findStreams(bytes: Uint8Array): StreamRange[] {
  const streams: StreamRange[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const streamKeyword = findAscii(bytes, "stream", cursor);
    if (streamKeyword < 0) break;
    const endStream = findAscii(bytes, "endstream", streamKeyword + "stream".length);
    if (endStream < 0) break;
    const prefix = ascii(bytes, 0, streamKeyword);
    const dictionaryStart = prefix.lastIndexOf("<<");
    if (dictionaryStart >= 0) {
      const dictionary = ascii(bytes, dictionaryStart, streamKeyword);
      const lengthRange = directLengthRange(dictionary);
      if (lengthRange) {
        streams.push({
          filter: hasOnlyFlateDecodeFilter(dictionary)
            ? "flate"
            : /\/Filter/.test(dictionary)
              ? "other"
              : "none",
          objectNumber: objectNumberBefore(bytes, dictionaryStart),
          dictionaryStart,
          dictionaryEnd: streamKeyword,
          lengthStart: dictionaryStart + lengthRange.start,
          lengthEnd: dictionaryStart + lengthRange.end,
          streamStart: streamDataStart(bytes, streamKeyword),
          streamEnd: endStream,
        });
      }
    }
    cursor = endStream + "endstream".length;
  }
  return streams;
}

function findFlateStreams(bytes: Uint8Array): FlateStreamRange[] {
  return findStreams(bytes).filter((stream) => stream.filter === "flate");
}

function pageStreams(bytes: Uint8Array, scope: PdfRewritePageScope): PageStream[] {
  return findStreams(bytes).flatMap<PageStream>((stream) => {
    if (stream.objectNumber === null || !scope.contentObjects.has(stream.objectNumber)) return [];
    if (stream.filter === "none") {
      return [{
        content: bytes.subarray(stream.streamStart, stream.streamEnd),
        fileOffset: stream.streamStart,
        flate: null,
      }];
    }
    if (stream.filter !== "flate") return [];
    try {
      const content = inflate(bytes.slice(stream.streamStart, stream.streamEnd));
      return [{ content, fileOffset: null, flate: stream }];
    } catch {
      // Unsupported or corrupt compressed stream; direct rewrite will fall back.
      return [];
    }
  });
}

/** Font resource set by the last `Tf` before `offset` in a content stream. */
function fontAt(content: Uint8Array, offset: number): string | undefined {
  const text = ascii(content, 0, offset);
  let font: string | undefined;
  for (const match of text.matchAll(/\/([^\s/[\]()<>{}%]+)\s+[-+\d.]+\s+Tf\b/g)) {
    font = match[1];
  }
  return font;
}

function shiftMatch(match: TextShowingMatch, offset: number): TextShowingMatch {
  return {
    decoded: match.decoded,
    spans: match.spans.map((span) => ({
      contentStart: span.contentStart + offset,
      contentEnd: span.contentEnd + offset,
    })),
  };
}

// Only text drawn on the edited page is a candidate, so equal text elsewhere in
// the file is never touched.
function pageRewriteCandidates(
  streams: PageStream[],
  originalText: string,
): RewriteCandidate[] {
  return streams.flatMap((stream) =>
    directTextShowingMatches(stream.content)
      .filter((match) => match.decoded === originalText)
      .map<RewriteCandidate>((match) => {
        const font = fontAt(stream.content, match.spans[0].contentStart);
        return stream.flate
          ? { kind: "flate", stream: stream.flate, decodedBytes: stream.content, match, font }
          : { kind: "raw", match: shiftMatch(match, stream.fileOffset ?? 0), font };
      }),
  );
}

/** Characters the page already shows in `font`; a subset font is sure to hold these glyphs. */
function charactersShownInFont(streams: PageStream[], font: string): Set<string> {
  const shown = new Set<string>();
  for (const stream of streams) {
    for (const match of directTextShowingMatches(stream.content)) {
      if (fontAt(stream.content, match.spans[0].contentStart) !== font) continue;
      for (const character of match.decoded) shown.add(character);
    }
  }
  return shown;
}

function glyphsAvailable(
  streams: PageStream[],
  scope: PdfRewritePageScope,
  candidate: RewriteCandidate,
  replacementText: string,
): boolean {
  if (!candidate.font || !scope.subsetFonts.has(candidate.font)) return true;
  const shown = charactersShownInFont(streams, candidate.font);
  return [...replacementText].every((character) => shown.has(character));
}

function rewriteSpans(
  bytes: Uint8Array,
  spans: TextShowingMatch["spans"],
  replacement: Uint8Array,
): void {
  let replacementOffset = 0;
  for (const span of spans) {
    const spanCapacity = span.contentEnd - span.contentStart;
    const remaining = replacement.length - replacementOffset;
    const take = Math.max(0, Math.min(spanCapacity, remaining));
    if (take > 0) {
      bytes.set(
        replacement.slice(replacementOffset, replacementOffset + take),
        span.contentStart,
      );
    }
    bytes.fill(0x20, span.contentStart + take, span.contentEnd);
    replacementOffset += take;
  }
}

function replacementFits(match: TextShowingMatch, replacement: Uint8Array): boolean {
  const capacity = match.spans.reduce(
    (sum, span) => sum + span.contentEnd - span.contentStart,
    0,
  );
  return replacement.length <= capacity;
}

function compressedReplacementFits(
  stream: FlateStreamRange,
  compressed: Uint8Array,
): boolean {
  if (compressed.length > stream.streamEnd - stream.streamStart) return false;
  const originalLengthDigits = stream.lengthEnd - stream.lengthStart;
  return String(compressed.length).length <= originalLengthDigits;
}

function writeCompressedStream(
  bytes: Uint8Array,
  stream: FlateStreamRange,
  compressed: Uint8Array,
): void {
  const lengthText = String(compressed.length).padEnd(stream.lengthEnd - stream.lengthStart, " ");
  for (let index = 0; index < lengthText.length; index += 1) {
    bytes[stream.lengthStart + index] = lengthText.charCodeAt(index);
  }
  bytes.set(compressed, stream.streamStart);
  bytes.fill(0x20, stream.streamStart + compressed.length, stream.streamEnd);
}

function directRewriteCandidates(
  bytes: Uint8Array,
  originalText: string,
): RewriteCandidate[] {
  const rawCandidates = directTextShowingMatches(bytes)
    .filter((match) => match.decoded === originalText)
    .map<RewriteCandidate>((match) => ({ kind: "raw", match }));
  const flateCandidates: RewriteCandidate[] = [];
  for (const stream of findFlateStreams(bytes)) {
    try {
      const decodedBytes = inflate(bytes.slice(stream.streamStart, stream.streamEnd));
      directTextShowingMatches(decodedBytes)
        .filter((match) => match.decoded === originalText)
        .forEach((match) => {
          flateCandidates.push({ kind: "flate", stream, decodedBytes, match });
        });
    } catch {
      // Unsupported or corrupt compressed stream; direct rewrite will fall back.
    }
  }
  return [...rawCandidates, ...flateCandidates];
}

function directOperations(edits: PdfEditDocument): PdfDirectTextEditOperation[] {
  return edits.pages.flatMap((page) =>
    page.operations.flatMap((operation) =>
      operation.type === "directTextEdit" ? [operation] : [],
    ),
  );
}

export function tryDirectTextRewrite(
  originalBytes: Uint8Array,
  edits: PdfEditDocument,
  scopes?: ReadonlyMap<number, PdfRewritePageScope>,
): PdfDirectRewriteResult {
  const bytes = new Uint8Array(originalBytes);
  const appliedIds = new Set<string>();
  const skippedIds = new Set<string>();

  for (const operation of directOperations(edits)) {
    if (!operation.originalText || operation.originalText === operation.replacementText) {
      skippedIds.add(operation.id);
      continue;
    }
    const replacement = encodeLiteralContent(operation.replacementText);
    if (!replacement) {
      skippedIds.add(operation.id);
      continue;
    }
    const scope = scopes?.get(operation.page);
    if (scopes && !scope) {
      skippedIds.add(operation.id);
      continue;
    }
    const streams = scope ? pageStreams(bytes, scope) : [];
    const candidates = scope
      ? pageRewriteCandidates(streams, operation.originalText)
      : directRewriteCandidates(bytes, operation.originalText);
    if (candidates.length !== 1) {
      skippedIds.add(operation.id);
      continue;
    }
    const [candidate] = candidates;
    if (
      !replacementFits(candidate.match, replacement) ||
      (scope && !glyphsAvailable(streams, scope, candidate, operation.replacementText))
    ) {
      skippedIds.add(operation.id);
      continue;
    }
    if (candidate.kind === "raw") {
      rewriteSpans(bytes, candidate.match.spans, replacement);
    } else {
      const decoded = new Uint8Array(candidate.decodedBytes);
      rewriteSpans(decoded, candidate.match.spans, replacement);
      const compressed = deflate(decoded);
      if (!compressedReplacementFits(candidate.stream, compressed)) {
        skippedIds.add(operation.id);
        continue;
      }
      writeCompressedStream(bytes, candidate.stream, compressed);
    }
    appliedIds.add(operation.id);
  }

  return { bytes, appliedIds, skippedIds };
}
