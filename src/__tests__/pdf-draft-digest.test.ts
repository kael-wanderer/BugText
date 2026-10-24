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
