import { describe, expect, it, vi } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { Util, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  DEFAULT_PDF_TEXT_STYLE,
  addPdfEditOperation,
  createPdfEditDocument,
  type PdfRect,
} from "../pdf-edit-document";
import { writeEditedPdf } from "../pdf-edit-writer";
import { PDF_SYSTEM_FONT_DIR, type PdfFontBytesLoader } from "../pdf-unicode-fonts";

// The project has no Node type definitions; give fs the two calls used here.
const { existsSync, readFileSync } = (await import("node:fs" as string)) as {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => Uint8Array;
};
const hasSystemFonts = existsSync(`${PDF_SYSTEM_FONT_DIR}Arial.ttf`);
const loadSystemFont: PdfFontBytesLoader = async (path) =>
  existsSync(path) ? new Uint8Array(readFileSync(path)) : null;

async function blankPdf(setup?: (page: ReturnType<PDFDocument["addPage"]>) => void) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 600]);
  setup?.(page);
  return pdf.save();
}

function textEdit(text: string, rect: PdfRect, box = { page: 1, width: 400, height: 600 }) {
  return addPdfEditOperation(createPdfEditDocument("sample"), box, {
    id: "text-1",
    type: "textBox",
    page: 1,
    rect,
    text,
    style: { ...DEFAULT_PDF_TEXT_STYLE, fontSize: 12 },
  });
}

async function firstTextItem(bytes: Uint8Array) {
  const loaded = await getDocument({ data: bytes }).promise;
  const page = await loaded.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const item = content.items.find((entry) => "str" in entry && entry.str.trim())!;
  if (!("str" in item)) throw new Error("no text");
  return { item, viewport };
}

describe("writeEditedPdf text encoding", () => {
  it.skipIf(!hasSystemFonts)("saves Vietnamese text with a system font", async () => {
    const output = await writeEditedPdf(
      await blankPdf(),
      textEdit("Biên bản họp → Đà Nẵng", { x: 40, y: 40, width: 300, height: 30 }),
      loadSystemFont,
    );
    const { item } = await firstTextItem(output);
    expect(item.str).toBe("Biên bản họp → Đà Nẵng");
  });

  it("keeps the standard font for Western text without reading font files", async () => {
    const loader = vi.fn(loadSystemFont);
    const output = await writeEditedPdf(
      await blankPdf(),
      textEdit("Café – “quoted”", { x: 40, y: 40, width: 300, height: 30 }),
      loader,
    );
    expect(loader).not.toHaveBeenCalled();
    expect((await firstTextItem(output)).item.str).toBe("Café – “quoted”");
  });

  it.skipIf(!hasSystemFonts)("names characters no installed font can draw", async () => {
    await expect(
      writeEditedPdf(
        await blankPdf(),
        textEdit("Done 😀", { x: 40, y: 40, width: 300, height: 30 }),
        loadSystemFont,
      ),
    ).rejects.toThrow(/no installed font can draw "😀"/);
  });

  it("explains the failure when no system fonts can be read", async () => {
    await expect(
      writeEditedPdf(
        await blankPdf(),
        textEdit("Biên bản", { x: 40, y: 40, width: 300, height: 30 }),
        async () => null,
      ),
    ).rejects.toThrow(/no installed font can draw "ả"\. Remove or replace that character/);
  });
});

describe("writeEditedPdf page geometry", () => {
  it.each([0, 90, 180, 270])(
    "places text where the editor showed it on a cropped page rotated %i degrees",
    async (rotation) => {
      const source = await blankPdf((page) => {
        page.setCropBox(20, 35, 300, 500);
        page.setRotation(degrees(rotation));
      });
      const sideways = rotation % 180 !== 0;
      // The editor's page box is the page as shown: cropped, then turned.
      const box = { page: 1, width: sideways ? 500 : 300, height: sideways ? 300 : 500 };
      const rect = { x: 30, y: 60, width: 200, height: 20 };
      const output = await writeEditedPdf(source, textEdit("Placed", rect, box));

      const { item, viewport } = await firstTextItem(output);
      const onScreen = Util.transform(viewport.transform, item.transform);
      // Baseline start lands at the box's left edge, one font size below its top.
      expect(onScreen[4]).toBeCloseTo(rect.x, 0);
      expect(onScreen[5]).toBeCloseTo(rect.y + 12, 0);
      // Upright on screen: runs left to right with no turn.
      expect(onScreen[0]).toBeGreaterThan(0);
      expect(Math.abs(onScreen[1])).toBeLessThan(1e-6);
    },
  );
});
