import { describe, expect, it } from "vitest";
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from "pdf-lib";
import { initialPlan, movePages, rotatePages, deletePages, insertPages } from "../pdf-pages/plan";
import { buildOrganizedPdf, countPruned, extractPages } from "../pdf-pages/writer";
import { inspectPdf } from "../pdf-pages/inspect";
const N = PDFName.of;
async function markers(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes); const found: number[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFDict ? object : undefined;
    const marker = dict?.lookupMaybe(N("BugTestMarker"), PDFNumber); if (marker) found.push(marker.asNumber());
  }
  return found.sort((a, b) => a - b);
}
async function fixture() {
  const doc = await PDFDocument.create();
  const pages = Array.from({ length: 10 }, (_, i) => { const page = doc.addPage([300 + i, 400]); page.node.set(N("BugTestMarker"), PDFNumber.of(i)); return page; });
  pages[1].setRotation(degrees(90));
  const outlines = doc.context.obj({ Type: "Outlines" }); const rootRef = doc.context.register(outlines);
  doc.catalog.set(N("Outlines"), rootRef);
  const items = pages.map((page, i) => {
    const item = doc.context.obj({ Title: PDFString.of(`Page ${i}`), Parent: rootRef, Dest: [page.ref, N("Fit")] });
    return { item, ref: doc.context.register(item) };
  });
  items.forEach(({ item }, i) => { if (i) item.set(N("Prev"), items[i - 1].ref); if (i < 9) item.set(N("Next"), items[i + 1].ref); });
  outlines.set(N("First"), items[0].ref); outlines.set(N("Last"), items[9].ref); outlines.set(N("Count"), PDFNumber.of(10));
  const child = doc.context.obj({ Title: PDFString.of("child"), Parent: items[4].ref, Dest: [pages[2].ref, N("Fit")] });
  const childRef = doc.context.register(child); items[4].item.set(N("First"), childRef); items[4].item.set(N("Last"), childRef); items[4].item.set(N("Count"), PDFNumber.of(1));
  const link = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 10, 10], Dest: [pages[4].ref, N("Fit")] });
  pages[0].node.set(N("Annots"), doc.context.obj([doc.context.register(link)]));
  const field = doc.context.obj({ FT: "Tx", Subtype: "Widget", T: PDFString.of("field"), P: pages[5].ref, Rect: [0, 0, 10, 10] });
  const fieldRef = doc.context.register(field); pages[5].node.set(N("Annots"), doc.context.obj([fieldRef]));
  doc.catalog.set(N("AcroForm"), doc.context.register(doc.context.obj({ Fields: [fieldRef] })));
  const insert = await PDFDocument.create(); for (let i = 0; i < 3; i++) insert.addPage([500 + i, 400]);
  return { bytes: await doc.save(), inserted: await insert.save() };
}
describe("PDF page writer", () => {
  it("reorders, rotates, inserts and prunes references while preserving children", async () => {
    const { bytes, inserted } = await fixture(); let plan = initialPlan(10);
    plan = movePages(plan, ["self:1"], 0); plan = rotatePages(plan, ["self:1"], 90);
    const deleted = deletePages(plan, ["self:4", "self:5"]); if ("error" in deleted) throw new Error(deleted.error);
    plan = insertPages(deleted, { id: "insert", name: "i.pdf", path: "/i.pdf", bytes: inserted, pageCount: 3 }, 2);
    const expected = { bookmarks: 2, links: 1, fields: 1 };
    expect(await countPruned(bytes, plan)).toEqual(expected);
    const result = await buildOrganizedPdf(bytes, plan); expect(result.pruned).toEqual(expected);
    const output = await PDFDocument.load(result.bytes); expect(output.getPageCount()).toBe(11);
    expect(output.getPages().map(p => p.getWidth())).toEqual([301, 300, 500, 501, 502, 302, 303, 306, 307, 308, 309]);
    expect(output.getPage(0).getRotation().angle).toBe(180);
    const root = output.catalog.lookup(N("Outlines"), PDFDict); let current = root.get(N("First")); const titles: string[] = [];
    while (current) { const item = output.context.lookup(current, PDFDict); titles.push(item.lookup(N("Title"), PDFString).decodeText()); current = item.get(N("Next")); }
    expect(titles).toEqual(["Page 0", "Page 1", "Page 2", "Page 3", "child", "Page 6", "Page 7", "Page 8", "Page 9"]);
    expect(output.getPage(1).node.lookup(N("Annots"), PDFArray).size()).toBe(0);
    expect(output.catalog.lookup(N("AcroForm"), PDFDict).lookup(N("Fields"), PDFArray).size()).toBe(0);
  });
  it("leaves no objects of deleted pages in the saved file", async () => {
    const { bytes } = await fixture();
    const plan = deletePages(initialPlan(10), ["self:4", "self:5"]); if ("error" in plan) throw new Error(plan.error);
    expect(await markers((await buildOrganizedPdf(bytes, plan)).bytes)).toEqual([0, 1, 2, 3, 6, 7, 8, 9]);
  });
  it("extracts only the chosen pages, not pages their links point to", async () => {
    const { bytes } = await fixture();
    // Page 0 links to page 4 and page 5 holds a form field: neither may come along.
    const output = await extractPages(bytes, initialPlan(10), ["self:0", "self:5"]);
    expect(await markers(output)).toEqual([0, 5]);
    expect((await PDFDocument.load(output)).getPage(0).node.lookupMaybe(N("Annots"), PDFArray)?.size() ?? 0).toBe(0);
  });
  it("extracts selected pages in plan order with rotation", async () => {
    const { bytes } = await fixture(); let plan = rotatePages(initialPlan(10), ["self:4"], 90);
    plan = movePages(plan, ["self:6"], 0);
    const output = await PDFDocument.load(await extractPages(bytes, plan, ["self:2", "self:4", "self:6"]));
    expect(output.getPages().map(p => p.getWidth())).toEqual([306, 302, 304]); expect(output.getPage(2).getRotation().angle).toBe(90);
  });
  it("detects a signed field and encrypted documents", async () => {
    const doc = await PDFDocument.create(); doc.addPage();
    const sig = doc.context.register(doc.context.obj({ FT: "Sig", V: doc.context.obj({ Type: "Sig" }) }));
    doc.catalog.set(N("AcroForm"), doc.context.register(doc.context.obj({ Fields: [sig] })));
    expect(await inspectPdf(await doc.save())).toEqual({ encrypted: false, signed: true, pageCount: 1 });
    doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: "Standard" }));
    expect((await inspectPdf(await doc.save())).encrypted).toBe(true);
  });
});
