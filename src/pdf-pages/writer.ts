import { degrees, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFObject, PDFString } from "pdf-lib";
import type { PagePlan, PlanPage } from "./plan";

export type Pruned = { bookmarks: number; links: number; fields: number };
const N = PDFName.of;
const text = (o: PDFObject | undefined): string | undefined => o instanceof PDFName || o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined;

type Node = { ref: PDFObject; dict: PDFDict; children: Node[]; count: number };
function prune(doc: PDFDocument, plan: PagePlan): Pruned {
  const original = doc.getPages();
  const keep = new Set(plan.pages.filter(p => p.source === "self").map(p => p.index));
  const deleted = new Set(original.filter((_, i) => !keep.has(i)).map(p => p.ref.toString()));
  const pruned = { bookmarks: 0, links: 0, fields: 0 };
  const lookup = (obj: PDFObject | undefined): PDFObject | undefined => obj ? doc.context.lookup(obj) : undefined;
  const dict = (obj: PDFObject | undefined): PDFDict | undefined => { const o = lookup(obj); return o instanceof PDFDict ? o : undefined; };
  const array = (obj: PDFObject | undefined): PDFArray | undefined => { const o = lookup(obj); return o instanceof PDFArray ? o : undefined; };
  const named = new Map<string, PDFObject>();
  const dests = doc.catalog.lookupMaybe(N("Dests"), PDFDict);
  if (dests) for (const [key, value] of dests.entries()) named.set(key.decodeText(), value);
  const names = doc.catalog.lookupMaybe(N("Names"), PDFDict);
  const visitedNameTrees = new Set<PDFDict>();
  function readNames(tree: PDFDict | undefined): void {
    if (!tree || visitedNameTrees.has(tree)) return;
    visitedNameTrees.add(tree);
    const pairs = array(tree.get(N("Names")));
    if (pairs) for (let i = 0; i + 1 < pairs.size(); i += 2) { const key = text(lookup(pairs.get(i))); if (key !== undefined) named.set(key, pairs.get(i + 1)); }
    const kids = array(tree.get(N("Kids")));
    if (kids) for (let i = 0; i < kids.size(); i++) readNames(dict(kids.get(i)));
  }
  readNames(names && dict(names.get(N("Dests"))));
  function targetsDeleted(raw: PDFObject | undefined, seen = new Set<PDFObject>()): boolean {
    if (!raw || seen.has(raw)) return false;
    seen.add(raw);
    const obj = lookup(raw);
    if (obj instanceof PDFArray) return obj.size() > 0 && deleted.has(obj.get(0).toString());
    if (obj instanceof PDFDict) return targetsDeleted(obj.get(N("D")), seen);
    const key = text(obj);
    return key !== undefined ? targetsDeleted(named.get(key), seen) : false;
  }
  function itemTargetsDeleted(item: PDFDict): boolean {
    if (targetsDeleted(item.get(N("Dest")))) return true;
    const action = dict(item.get(N("A")));
    return !!action && action.lookupMaybe(N("S"), PDFName) === N("GoTo") && targetsDeleted(action.get(N("D")));
  }
  const outlines = doc.catalog.lookupMaybe(N("Outlines"), PDFDict);
  const seenOutlines = new Set<PDFDict>();
  function readSiblings(first: PDFObject | undefined): Node[] {
    const result: Node[] = [];
    let ref = first;
    while (ref) {
      const item = dict(ref); if (!item || seenOutlines.has(item)) break;
      seenOutlines.add(item);
      const next = item.get(N("Next"));
      const children = readSiblings(item.get(N("First")));
      const count = item.lookupMaybe(N("Count"), PDFNumber)?.asNumber() ?? 0;
      if (itemTargetsDeleted(item)) { pruned.bookmarks++; result.push(...children); }
      else result.push({ ref, dict: item, children, count });
      ref = next;
    }
    return result;
  }
  function writeSiblings(parent: PDFDict, parentRef: PDFObject, nodes: Node[]): number {
    if (nodes.length) { parent.set(N("First"), nodes[0].ref); parent.set(N("Last"), nodes[nodes.length - 1].ref); }
    else { parent.delete(N("First")); parent.delete(N("Last")); }
    let visible = 0;
    nodes.forEach((node, i) => {
      node.dict.set(N("Parent"), parentRef);
      if (i) node.dict.set(N("Prev"), nodes[i - 1].ref); else node.dict.delete(N("Prev"));
      if (i + 1 < nodes.length) node.dict.set(N("Next"), nodes[i + 1].ref); else node.dict.delete(N("Next"));
      const childrenVisible = writeSiblings(node.dict, node.ref, node.children);
      if (node.children.length) node.dict.set(N("Count"), PDFNumber.of(node.count < 0 ? -childrenVisible : childrenVisible));
      else node.dict.delete(N("Count"));
      visible += 1 + (node.count < 0 ? 0 : childrenVisible);
    });
    return visible;
  }
  if (outlines) {
    const nodes = readSiblings(outlines.get(N("First")));
    const ref = doc.catalog.get(N("Outlines"));
    if (ref) outlines.set(N("Count"), PDFNumber.of(writeSiblings(outlines, ref, nodes)));
  }
  for (const page of original.filter((_, i) => keep.has(i))) {
    const annots = page.node.lookupMaybe(N("Annots"), PDFArray);
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const annot = dict(annots.get(i));
      if (annot?.lookupMaybe(N("Subtype"), PDFName) === N("Link") && itemTargetsDeleted(annot)) { annots.remove(i); pruned.links++; }
    }
  }
  const form = doc.catalog.lookupMaybe(N("AcroForm"), PDFDict);
  const fields = form?.lookupMaybe(N("Fields"), PDFArray);
  const seenFields = new Set<PDFDict>();
  function pruneField(ref: PDFObject): { remove: boolean; widgets: number; kept: number } {
    const field = dict(ref);
    if (!field || seenFields.has(field)) return { remove: false, widgets: 0, kept: 0 };
    seenFields.add(field);
    const widget = field.lookupMaybe(N("Subtype"), PDFName) === N("Widget");
    const pageRef = field.get(N("P"));
    let widgets = widget ? 1 : 0, kept = widget && (!pageRef || !deleted.has(pageRef.toString())) ? 1 : 0;
    const kids = array(field.get(N("Kids")));
    if (kids) for (let i = kids.size() - 1; i >= 0; i--) {
      const result = pruneField(kids.get(i)); widgets += result.widgets; kept += result.kept;
      if (result.remove) kids.remove(i);
    }
    return { remove: widgets > 0 && kept === 0, widgets, kept };
  }
  if (fields) for (let i = fields.size() - 1; i >= 0; i--) if (pruneField(fields.get(i)).remove) { fields.remove(i); pruned.fields++; }
  return pruned;
}

async function loadSources(selfBytes: Uint8Array, plan: PagePlan): Promise<Map<string, PDFDocument>> {
  const sources = new Map<string, PDFDocument>();
  sources.set("self", await PDFDocument.load(selfBytes, { updateMetadata: false }));
  for (const source of new Set(plan.pages.map(p => p.source))) if (source !== "self") {
    const insert = plan.inserts.get(source); if (!insert) throw new Error("Missing inserted PDF");
    sources.set(source, await PDFDocument.load(insert.bytes, { updateMetadata: false }));
  }
  return sources;
}
function rotate(page: ReturnType<PDFDocument["getPage"]>, entry: PlanPage): void {
  page.setRotation(degrees(((page.getRotation().angle + entry.rotation) % 360 + 360) % 360));
}
export async function countPruned(selfBytes: Uint8Array, plan: PagePlan): Promise<Pruned> {
  return prune(await PDFDocument.load(selfBytes, { updateMetadata: false }), plan);
}
export async function buildOrganizedPdf(selfBytes: Uint8Array, plan: PagePlan): Promise<{ bytes: Uint8Array; pruned: Pruned }> {
  const sources = await loadSources(selfBytes, plan); const doc = sources.get("self")!;
  const pruned = prune(doc, plan); const original = doc.getPages();
  const ordered = await Promise.all(plan.pages.map(async entry => {
    const page = entry.source === "self" ? original[entry.index] : (await doc.copyPages(sources.get(entry.source)!, [entry.index]))[0];
    if (!page) throw new Error("Invalid page index"); rotate(page, entry); return page;
  }));
  for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
  ordered.forEach((page, i) => doc.insertPage(i, page));
  return { bytes: await doc.save({ useObjectStreams: true, updateFieldAppearances: false }), pruned };
}
export async function extractPages(selfBytes: Uint8Array, plan: PagePlan, keys: string[]): Promise<Uint8Array> {
  const selected = new Set(keys); const entries = plan.pages.filter(p => selected.has(p.key));
  if (!entries.length) throw new Error("No pages selected");
  const sources = await loadSources(selfBytes, { ...plan, pages: entries }); const output = await PDFDocument.create();
  for (const entry of entries) { const [page] = await output.copyPages(sources.get(entry.source)!, [entry.index]); rotate(page, entry); output.addPage(page); }
  return output.save({ useObjectStreams: true });
}
