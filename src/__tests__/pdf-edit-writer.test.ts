import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  DEFAULT_PDF_TEXT_STYLE,
  addPdfEditOperation,
  createPdfEditDocument,
  type PdfDirectTextEditOperation,
} from "../pdf-edit-document";
import {
  pdfEditColor,
  standardFontFor,
  writeEditedPdf,
  writeEditedPdfWithReport,
} from "../pdf-edit-writer";

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([300, 200]);
  page.drawText("Original text", {
    x: 30,
    y: 150,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });
  return pdf.save();
}

function minimalPdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 30 150 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

function directEdit(replacementText: string): PdfDirectTextEditOperation {
  return {
    id: "direct-1",
    type: "directTextEdit",
    page: 1,
    sourceId: "test",
    originalText: "Original text",
    replacementText,
    rect: { x: 25, y: 35, width: 140, height: 24 },
  };
}

function tinyPngBytes(): number[] {
  return Array.from(
    Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lz6G8QAAAABJRU5ErkJggg=="),
      (character) => character.charCodeAt(0),
    ),
  );
}

describe("pdf edit writer", () => {
  it("parses hex colors into pdf-lib RGB colors", () => {
    expect(pdfEditColor("#336699")).toEqual(rgb(0.2, 0.4, 0.6));
    expect(pdfEditColor("336699")).toEqual(rgb(0.2, 0.4, 0.6));
    expect(pdfEditColor("not-a-color")).toEqual(rgb(0, 0, 0));
  });

  it("maps standard font families with bold and italic variants", () => {
    expect(standardFontFor({ ...DEFAULT_PDF_TEXT_STYLE, fontFamily: "Courier" })).toBe(
      StandardFonts.Courier,
    );
    expect(
      standardFontFor({
        ...DEFAULT_PDF_TEXT_STYLE,
        fontFamily: "ABCDEF+CourierNewPS-ItalicMT",
        italic: true,
      }),
    ).toBe(StandardFonts.CourierOblique);
    expect(
      standardFontFor({
        ...DEFAULT_PDF_TEXT_STYLE,
        fontFamily: "Times",
        bold: true,
        italic: true,
      }),
    ).toBe(StandardFonts.TimesRomanBoldItalic);
    expect(standardFontFor({ ...DEFAULT_PDF_TEXT_STYLE, italic: true })).toBe(
      StandardFonts.HelveticaOblique,
    );
  });

  it("writes text boxes and cover patches into a copied PDF", async () => {
    const edits = addPdfEditOperation(
      addPdfEditOperation(
        createPdfEditDocument("sample"),
        { page: 1, width: 300, height: 200 },
        {
          id: "cover-1",
          type: "coverPatch",
          page: 1,
          rect: { x: 25, y: 35, width: 120, height: 24 },
          color: "#ffffff",
          opacity: 1,
        },
      ),
      { page: 1, width: 300, height: 200 },
      {
        id: "text-1",
        type: "textBox",
        page: 1,
        rect: { x: 30, y: 34, width: 140, height: 28 },
        text: "Replacement",
        style: {
          ...DEFAULT_PDF_TEXT_STYLE,
          fontSize: 16,
          color: "#aa0000",
          bold: true,
        },
      },
    );

    const output = await writeEditedPdf(await samplePdf(), edits);
    const loaded = await PDFDocument.load(output);

    expect(output.length).toBeGreaterThan(900);
    expect(loaded.getPageCount()).toBe(1);
  });

  it("writes replacement text operations", async () => {
    const edits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      {
        id: "replace-1",
        type: "replacementText",
        page: 1,
        sourceText: "Original text",
        cover: {
          rect: { x: 25, y: 35, width: 120, height: 24 },
          rects: [
            { x: 25, y: 35, width: 120, height: 10 },
            { x: 25, y: 49, width: 80, height: 10 },
          ],
          color: "#ffffff",
          opacity: 1,
        },
        text: {
          rect: { x: 30, y: 34, width: 140, height: 28 },
          value: "Edited text",
          style: DEFAULT_PDF_TEXT_STYLE,
        },
      },
    );

    const output = await writeEditedPdf(await samplePdf(), edits);
    const loaded = await PDFDocument.load(output);

    expect(output.length).toBeGreaterThan(900);
    expect(loaded.getPage(0).getSize()).toEqual({ width: 300, height: 200 });
  });

  it("writes image box operations", async () => {
    const edits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      {
        id: "image-1",
        type: "imageBox",
        page: 1,
        rect: { x: 40, y: 40, width: 64, height: 48 },
        name: "stamp.png",
        mimeType: "image/png",
        bytes: tinyPngBytes(),
      },
    );

    const output = await writeEditedPdf(await samplePdf(), edits);
    const loaded = await PDFDocument.load(output);

    expect(output.length).toBeGreaterThan(900);
    expect(loaded.getPageCount()).toBe(1);
  });

  it("keeps direct text rewrite output loadable", async () => {
    const edits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      directEdit("Edited text"),
    );
    const output = await writeEditedPdf(minimalPdf("Original text"), edits);
    const loaded = await PDFDocument.load(output);

    expect(loaded.getPage(0).getSize()).toEqual({ width: 300, height: 200 });
  });

  it("falls back visually when direct text rewrite is unsafe", async () => {
    const edits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      directEdit("This replacement is too long for direct rewriting"),
    );
    const output = await writeEditedPdf(minimalPdf("Original text"), edits);
    const loaded = await PDFDocument.load(output);

    expect(output.length).toBeGreaterThan(900);
    expect(loaded.getPageCount()).toBe(1);
  });

  it("reports a direct replacement written into the page text", async () => {
    const edits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      directEdit("Edited text"),
    );
    const report = await writeEditedPdfWithReport(minimalPdf("Original text"), edits);
    expect(report).toMatchObject({ directApplied: 1, directFallback: 0 });
    await expect(PDFDocument.load(report.bytes)).resolves.toBeTruthy();
  });

  it("reports a direct replacement that fell back to a visual one", async () => {
    const edits = addPdfEditOperation(
      createPdfEditDocument("sample"),
      { page: 1, width: 300, height: 200 },
      directEdit("This replacement is too long for direct rewriting"),
    );
    const report = await writeEditedPdfWithReport(minimalPdf("Original text"), edits);
    expect(report).toMatchObject({ directApplied: 0, directFallback: 1 });
  });

  it("reports nothing when there are no direct replacements", async () => {
    const report = await writeEditedPdfWithReport(await samplePdf(), createPdfEditDocument("sample"));
    expect(report).toMatchObject({ directApplied: 0, directFallback: 0 });
  });
});
