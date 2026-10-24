import { describe, expect, it } from "vitest";
import {
  DEFAULT_PDF_TEXT_STYLE,
  addPdfEditOperation,
  createPdfEditDocument,
  parsePdfEditDocument,
  pdfDraftIsStale,
  pdfSourceDigest,
  serializePdfEditDocument,
} from "../pdf-edit-document";

const page = { page: 1, width: 612, height: 792 };

function draftWithEdit(sourceDigest?: string) {
  const document = addPdfEditOperation(createPdfEditDocument("a.pdf"), page, {
    id: "t1",
    type: "textBox",
    page: 1,
    rect: { x: 10, y: 10, width: 100, height: 20 },
    text: "Hi",
    style: DEFAULT_PDF_TEXT_STYLE,
  });
  return sourceDigest ? { ...document, sourceDigest } : document;
}

describe("pdf draft digest", () => {
  it("hashes bytes to a stable SHA-256 hex digest", async () => {
    const digest = await pdfSourceDigest(new TextEncoder().encode("abc"));
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("flags a draft made on different bytes", () => {
    expect(pdfDraftIsStale(draftWithEdit("old"), "new")).toBe(true);
    expect(pdfDraftIsStale(draftWithEdit("same"), "same")).toBe(false);
  });

  it("trusts drafts without a digest and empty drafts", () => {
    expect(pdfDraftIsStale(draftWithEdit(), "new")).toBe(false);
    expect(pdfDraftIsStale({ ...createPdfEditDocument("a.pdf"), sourceDigest: "old" }, "new")).toBe(false);
  });

  it("keeps the digest through a save and load", () => {
    const parsed = parsePdfEditDocument(serializePdfEditDocument(draftWithEdit("d1")));
    expect(parsed.sourceDigest).toBe("d1");
  });
});

describe("pdf draft image storage", () => {
  const image = (bytes: unknown) =>
    JSON.stringify({
      version: 1,
      sourceFingerprint: "a.pdf",
      pages: [{
        page: 1,
        width: 612,
        height: 792,
        operations: [{
          id: "i1",
          type: "imageBox",
          page: 1,
          rect: { x: 0, y: 0, width: 10, height: 10 },
          name: "logo.png",
          mimeType: "image/png",
          bytes,
        }],
      }],
    });

  it("stores image bytes as base64 and reads them back", () => {
    const bytes = Array.from({ length: 70000 }, (_, index) => index % 256);
    const raw = serializePdfEditDocument(parsePdfEditDocument(image(bytes)));
    expect(raw).not.toContain("[0,1,2");
    expect(raw.length).toBeLessThan(bytes.length * 1.5);
    const operation = parsePdfEditDocument(raw).pages[0].operations[0];
    expect(operation.type === "imageBox" && operation.bytes).toEqual(bytes);
  });

  it("still reads drafts that stored bytes as a number array", () => {
    const operation = parsePdfEditDocument(image([137, 80, 78, 71])).pages[0].operations[0];
    expect(operation.type === "imageBox" && operation.bytes).toEqual([137, 80, 78, 71]);
  });
});
