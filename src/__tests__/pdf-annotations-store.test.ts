import { describe, expect, it, vi } from "vitest";
import { AnnotationStore } from "../pdf-annotations/store";
import type { AnnotationDocument } from "../pdf-annotations/model";
const item = { id: "abc123", group: null, page: 1, rects: [[1, 2, 3, 4]] as [number, number, number, number][], quote: "text", color: "yellow" as const, comment: "", created: "", updated: "" };
function setup(initial?: AnnotationDocument) {
  const files = new Map<string, AnnotationDocument>(); if (initial) files.set(initial.path, initial);
  let callback: (event: unknown) => void = () => {};
  let conflict = false;
  const io = {
    read: vi.fn(async (path: string) => files.has(path) ? JSON.stringify(files.get(path)) : null),
    find: vi.fn(async (_digest: string) => initial ? JSON.stringify(initial) : null),
    forget: vi.fn(async (path: string) => { files.delete(path); }),
    write: vi.fn(async (path: string, raw: string, base: number | null) => {
      if (conflict) { conflict = false; throw "conflict"; }
      const old = files.get(path); if ((old?.revision ?? null) !== base) throw "conflict";
      const doc = JSON.parse(raw) as AnnotationDocument; const revision = (base ?? 0) + 1;
      if (doc.annotations.length) files.set(path, { ...doc, revision }); else files.delete(path);
      return revision;
    }),
    emit: vi.fn(async () => {}), listen: vi.fn(async (cb: (event: unknown) => void) => { callback = cb; return () => {}; }),
  };
  return { io, files, event: (e: unknown) => callback(e), conflict: () => { conflict = true; } };
}
const doc: AnnotationDocument = { version: 1, path: "/old.pdf", digest: "old", pages: 1, revision: 1, annotations: [item] };
describe("annotation store", () => {
  it("adopts a digest match and forgets its old entry", async () => {
    const s = setup(doc); const store = await AnnotationStore.load("/new.pdf", "old", 1, () => {}, s.io, "one");
    expect(store.document.annotations).toEqual([item]); expect(s.io.forget).toHaveBeenCalledWith("/old.pdf");
  });
  it("retries a conflict and keeps the new digest", async () => {
    const s = setup(doc); const store = await AnnotationStore.load("/old.pdf", "new", 1, () => {}, s.io, "one");
    expect(store.changed).toBe(true); s.conflict(); await store.keepDigest();
    expect(store.changed).toBe(false); expect(s.files.get("/old.pdf")?.digest).toBe("new");
    expect(s.io.write).toHaveBeenCalledTimes(2);
  });
  it("ignores events from self and reloads other windows", async () => {
    const s = setup(doc); const changed = vi.fn(); const store = await AnnotationStore.load("/old.pdf", "old", 1, changed, s.io, "one");
    s.event({ path: "/old.pdf", from: "one" }); await Promise.resolve(); expect(changed).not.toHaveBeenCalled();
    s.event({ path: "/old.pdf", from: "two" }); await new Promise((resolve) => setTimeout(resolve, 0)); expect(changed).toHaveBeenCalledOnce(); store.destroy();
  });
});
