import { describe, expect, it } from "vitest";
import { deflate, inflate } from "pako";
import {
  createPdfEditDocument,
  addPdfEditOperation,
  type PdfDirectTextEditOperation,
} from "../pdf-edit-document";
import { pdfLiteralRanges, tryDirectTextRewrite } from "../pdf-direct-rewrite";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { pdfRewriteScopes } from "../pdf-edit-writer";

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function minimalPdfWithStreamBytes(stream: Uint8Array, streamDictionary = ""): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  offsets.push(body.length);
  const streamPrefix =
    `${objects.length + 1} 0 obj\n` +
    `<< /Length ${stream.length}${streamDictionary ? ` ${streamDictionary}` : ""} >>\n` +
    "stream\n";
  const streamSuffix = "\nendstream\nendobj\n";
  body += streamPrefix;
  const xrefOffset =
    textBytes(body).length + stream.length + textBytes(streamSuffix).length;
  const afterStream = `${streamSuffix}xref\n0 ${objects.length + 2}\n`;
  body += "";
  let trailer = afterStream;
  trailer += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    trailer += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  trailer += `trailer << /Size ${objects.length + 2} /Root 1 0 R >>\n`;
  trailer += `startxref\n${xrefOffset}\n%%EOF\n`;
  return concatBytes([textBytes(body), stream, textBytes(trailer)]);
}

function minimalPdfWithStream(stream: string): Uint8Array {
  return minimalPdfWithStreamBytes(textBytes(stream));
}

function streamBytesFromPdf(pdf: Uint8Array): Uint8Array {
  const raw = new TextDecoder("latin1").decode(pdf);
  const streamKeyword = raw.indexOf("stream\n");
  const endStream = raw.indexOf("\nendstream", streamKeyword);
  return pdf.slice(streamKeyword + "stream\n".length, endStream);
}

function minimalCompressedPdfWithStream(stream: string): Uint8Array {
  return minimalPdfWithStreamBytes(deflate(textBytes(stream)), "/Filter /FlateDecode");
}

function inflatedStreamText(pdf: Uint8Array): string {
  return new TextDecoder().decode(inflate(streamBytesFromPdf(pdf)));
}

function minimalPdf(text: string): Uint8Array {
  return minimalPdfWithStream(`BT /F1 12 Tf 30 150 Td (${text}) Tj ET`);
}

function edit(originalText: string, replacementText: string): PdfDirectTextEditOperation {
  return {
    id: "direct-1",
    type: "directTextEdit",
    page: 1,
    sourceId: "test",
    originalText,
    replacementText,
    rect: { x: 30, y: 40, width: 100, height: 16 },
  };
}

describe("pdf direct text rewrite", () => {
  it("finds literal strings used by text showing operators", () => {
    const ranges = pdfLiteralRanges(minimalPdf("Original text"));
    expect(ranges.some((range) => range.decoded === "Original text" && range.textShowing)).toBe(
      true,
    );
  });

  it("rewrites one byte-compatible direct text edit in place", () => {
    const edits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      edit("Original text", "Edited text"),
    );
    const result = tryDirectTextRewrite(minimalPdf("Original text"), edits);
    const raw = new TextDecoder().decode(result.bytes);

    expect(result.appliedIds.has("direct-1")).toBe(true);
    expect(result.skippedIds.size).toBe(0);
    expect(raw).toContain("(Edited text  ) Tj");
  });

  it("rewrites split literal strings in a simple TJ array", () => {
    const pdf = minimalPdfWithStream("BT /F1 12 Tf 30 150 Td [(Ori) 20 (ginal text)] TJ ET");
    const edits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      edit("Original text", "Edited text"),
    );
    const result = tryDirectTextRewrite(pdf, edits);
    const raw = new TextDecoder().decode(result.bytes);

    expect(result.appliedIds.has("direct-1")).toBe(true);
    expect(result.skippedIds.size).toBe(0);
    expect(raw).toContain("[(Edi) 20 (ted text  )] TJ");
  });

  it("rewrites byte-compatible text inside a simple FlateDecode stream", () => {
    const edits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      edit("Original text", "Edited text"),
    );
    const result = tryDirectTextRewrite(
      minimalCompressedPdfWithStream("BT /F1 12 Tf 30 150 Td (Original text) Tj ET"),
      edits,
    );

    expect(result.appliedIds.has("direct-1")).toBe(true);
    expect(result.skippedIds.size).toBe(0);
    expect(inflatedStreamText(result.bytes)).toContain("(Edited text  ) Tj");
  });

  it("skips ambiguous or oversized direct edits", () => {
    const ambiguous = new Uint8Array([
      ...minimalPdf("Same"),
      ...new TextEncoder().encode("\nBT (Same) Tj ET\n"),
    ]);
    const ambiguousEdits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      edit("Same", "Done"),
    );
    expect(tryDirectTextRewrite(ambiguous, ambiguousEdits).skippedIds.has("direct-1")).toBe(
      true,
    );

    const longEdits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      edit("Short", "A replacement that is much too long"),
    );
    expect(tryDirectTextRewrite(minimalPdf("Short"), longEdits).skippedIds.has("direct-1")).toBe(
      true,
    );

    const splitLongEdits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      edit("Short", "Long replacement"),
    );
    const splitPdf = minimalPdfWithStream("BT /F1 12 Tf 30 150 Td [(Sh) 20 (ort)] TJ ET");
    expect(tryDirectTextRewrite(splitPdf, splitLongEdits).skippedIds.has("direct-1")).toBe(
      true,
    );

    const compressedLongEdits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      edit("Short", "A replacement that is much too long"),
    );
    expect(
      tryDirectTextRewrite(
        minimalCompressedPdfWithStream("BT /F1 12 Tf 30 150 Td (Short) Tj ET"),
        compressedLongEdits,
      ).skippedIds.has("direct-1"),
    ).toBe(true);
  });

  it("only rewrites text on the edited page", async () => {
    // Page 2 shows the text as a literal; page 1 shows it some other way (hex here),
    // which the byte search cannot match.
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const show of ["<48656c6c6f> Tj", "(Hello) Tj"]) {
      const page = pdf.addPage([300, 200]);
      page.drawText("x", { font, size: 1 });
      const stream = pdf.context.flateStream(`BT /F1 12 Tf 30 150 Td ${show} ET`);
      page.node.set(PDFName.of("Contents"), pdf.context.register(stream));
      page.node.setFontDictionary(PDFName.of("F1"), font.ref);
    }
    const bytes = await pdf.save({ useObjectStreams: false });
    const edits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      edit("Hello", "Howdy"),
    );
    const scopes = pdfRewriteScopes(await PDFDocument.load(bytes));

    const result = tryDirectTextRewrite(bytes, edits, scopes);
    expect(result.skippedIds.has("direct-1")).toBe(true);
    expect(result.bytes).toEqual(bytes);

    // Without the page scope the same edit would have rewritten page 2.
    expect(tryDirectTextRewrite(bytes, edits).appliedIds.has("direct-1")).toBe(true);
  });

  it("falls back when a subset font may lack the replacement glyphs", () => {
    const pdf = minimalPdfWithStream("BT /F1 12 Tf 30 150 Td (Cab) Tj ET");
    const edits = (replacement: string) =>
      addPdfEditOperation(
        createPdfEditDocument("sample"),
        { page: 1, width: 300, height: 200 },
        edit("Cab", replacement),
      );
    const scopes = new Map([[1, { contentObjects: new Set([5]), subsetFonts: new Set(["F1"]) }]]);

    expect(tryDirectTextRewrite(pdf, edits("Zed"), scopes).skippedIds.has("direct-1")).toBe(true);
    // Letters the page already draws in that font are safe to reuse.
    expect(tryDirectTextRewrite(pdf, edits("baC"), scopes).appliedIds.has("direct-1")).toBe(true);
    const fullFont = new Map([[1, { contentObjects: new Set([5]), subsetFonts: new Set<string>() }]]);
    expect(tryDirectTextRewrite(pdf, edits("Zed"), fullFont).appliedIds.has("direct-1")).toBe(true);
  });
});
