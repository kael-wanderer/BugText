import { describe, expect, it } from "vitest";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  addPdfEditOperation,
  createPdfEditDocument,
  type PdfDirectTextEditOperation,
} from "../pdf-edit-document";
import { writeEditedPdf } from "../pdf-edit-writer";
import { contentTokens, parseToUnicode, textShows } from "../pdf-font-rewrite";
import { PDF_SYSTEM_FONT_DIR } from "../pdf-unicode-fonts";

// The project has no Node type definitions; give fs the two calls used here.
const { existsSync, readFileSync } = (await import("node:fs" as string)) as {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => Uint8Array;
};
const arialPath = `${PDF_SYSTEM_FONT_DIR}Arial.ttf`;
const hasArial = existsSync(arialPath);

// pdf-lib writes embedded TrueType text as a Type0 Identity-H font with
// two-byte hex strings, which the byte-level rewrite cannot read.
async function cidPdf(text: string) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(new Uint8Array(readFileSync(arialPath)), { subset: true });
  pdf.addPage([400, 600]).drawText(text, { x: 40, y: 500, size: 14, font });
  return pdf.save();
}

function directEdit(originalText: string, replacementText: string) {
  const operation: PdfDirectTextEditOperation = {
    id: "direct-1",
    type: "directTextEdit",
    page: 1,
    sourceId: "test",
    originalText,
    replacementText,
    rect: { x: 40, y: 86, width: 120, height: 18 },
  };
  return addPdfEditOperation(createPdfEditDocument("sample"), { page: 1, width: 400, height: 600 }, operation);
}

async function pageText(bytes: Uint8Array) {
  const loaded = await getDocument({ data: bytes }).promise;
  const content = await (await loaded.getPage(1)).getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join("").trim();
}

describe("font-aware direct rewrite", () => {
  it("parses bfchar and bfrange entries, including the array form", () => {
    const map = parseToUnicode(
      "2 beginbfchar <0003> <0020> <0010> <00480069> endbfchar\n" +
        "2 beginbfrange <0020> <0022> <0041> <0030> <0031> [<0078> <0079>] endbfrange",
    );
    expect(map.get(3)).toBe(" ");
    expect(map.get(0x10)).toBe("Hi");
    expect([map.get(0x20), map.get(0x21), map.get(0x22)]).toEqual(["A", "B", "C"]);
    expect([map.get(0x30), map.get(0x31)]).toEqual(["x", "y"]);
  });

  it("reads hex, literal and TJ text shows with their font", () => {
    const content = new TextEncoder().encode(
      "BT /F1 12 Tf <00410042> Tj /F2 10 Tf [(a\\)b) -20 <63>] TJ ET",
    );
    const shows = textShows(contentTokens(content));
    expect(shows.map((show) => [show.font, show.strings])).toEqual([
      ["F1", [[0, 0x41, 0, 0x42]]],
      ["F2", [[0x61, 0x29, 0x62], [0x63]]],
    ]);
  });

  it.skipIf(!hasArial)("rewrites CID text in place when the font has the glyphs", async () => {
    const output = await writeEditedPdf(await cidPdf("Hello World"), directEdit("Hello World", "World Hello"));
    expect(await pageText(output)).toBe("World Hello");
  });

  it.skipIf(!hasArial)("pads shorter replacements with spaces", async () => {
    const output = await writeEditedPdf(await cidPdf("Hello World"), directEdit("Hello World", "Hello"));
    expect(await pageText(output)).toBe("Hello");
  });

  it.skipIf(!hasArial)("leaves the edit to the overlay when a glyph is missing", async () => {
    const source = await cidPdf("Hello World");
    const output = await writeEditedPdf(source, directEdit("Hello World", "Hello Earth"));
    // The original string stays in the content; the overlay covers and redraws it.
    const text = await pageText(output);
    expect(text).toContain("Hello World");
  });
});
