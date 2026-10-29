import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Annotation, AnnotationDocument } from "./model";

export const ANNOTATIONS_CHANGED_EVENT = "bugtext://annotations-changed";
type Transport = {
  read(path: string): Promise<string | null>;
  write(path: string, contents: string, baseRevision: number | null): Promise<number>;
  find(digest: string): Promise<string | null>;
  forget(path: string): Promise<void>;
  emit(path: string, from: string): Promise<void>;
  listen(callback: (change: unknown) => void): Promise<UnlistenFn>;
};
const transport: Transport = {
  read: (path) => invoke("pdf_annotations_read", { path }),
  write: (path, contents, baseRevision) => invoke("pdf_annotations_write", { path, contents, baseRevision }),
  find: (digest) => invoke("pdf_annotations_find_by_digest", { digest }),
  forget: (path) => invoke("pdf_annotations_forget", { path }),
  emit: (path, from) => emit(ANNOTATIONS_CHANGED_EVENT, { path, from }),
  listen: (callback) => listen(ANNOTATIONS_CHANGED_EVENT, (event) => callback(event.payload)),
};
const queues = new Map<string, Promise<void>>();
function enqueue(path: string, action: () => Promise<void>): Promise<void> {
  const next = (queues.get(path) ?? Promise.resolve()).catch(() => {}).then(action);
  queues.set(path, next);
  void next.finally(() => { if (queues.get(path) === next) queues.delete(path); }).catch(() => {});
  return next;
}
export class AnnotationStore {
  document: AnnotationDocument;
  changed = false;
  private revision: number | null = null;
  private unlisten: UnlistenFn | null = null;
  private closed = false;
  private constructor(private path: string, private digest: string, pages: number, private from: string, private io: Transport, private onChange: () => void) {
    this.document = { version: 1, path, digest, pages, revision: 0, annotations: [] };
  }
  static async load(path: string, digest: string, pages: number, onChange: () => void, io: Transport = transport, from = getCurrentWindow().label): Promise<AnnotationStore> {
    const store = new AnnotationStore(path, digest, pages, from, io, onChange);
    await enqueue(path, async () => {
      let raw = await io.read(path);
      if (!raw) {
        const match = await io.find(digest);
        if (match) {
          const old = JSON.parse(match) as AnnotationDocument;
          const adopted = { ...old, path, pages };
          try {
            const revision = await io.write(path, JSON.stringify(adopted), null);
            await io.forget(old.path);
            raw = JSON.stringify({ ...adopted, revision });
          } catch (error) {
            if (String(error).includes("conflict")) raw = await io.read(path);
            else throw error;
          }
        }
      }
      store.applyRead(raw);
    });
    const unlisten = await io.listen((change) => {
      if (!change || typeof change !== "object") return;
      const event = change as { path?: unknown; from?: unknown };
      if (event.path !== path || typeof event.from !== "string" || event.from === from) return;
      void enqueue(path, async () => { store.applyRead(await io.read(path)); if (!store.closed) onChange(); }).catch(() => {});
    });
    if (store.closed) unlisten(); else store.unlisten = unlisten;
    return store;
  }
  private applyRead(raw: string | null): void {
    if (raw) { this.document = JSON.parse(raw) as AnnotationDocument; this.revision = this.document.revision; }
    else { this.document = { version: 1, path: this.path, digest: this.digest, pages: this.document.pages, revision: 0, annotations: [] }; this.revision = null; }
    this.changed = this.document.digest !== this.digest;
  }
  private mutate(change: (doc: AnnotationDocument) => AnnotationDocument): Promise<void> {
    return enqueue(this.path, async () => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const next = change(this.document);
        try {
          const revision = await this.io.write(this.path, JSON.stringify(next), this.revision);
          this.document = { ...next, revision };
          this.revision = next.annotations.length ? revision : null;
          this.changed = next.digest !== this.digest;
          if (!this.closed) this.onChange();
          await this.io.emit(this.path, this.from);
          return;
        } catch (error) {
          if (!String(error).includes("conflict") || attempt === 7) throw error;
          this.applyRead(await this.io.read(this.path));
        }
      }
    });
  }
  keepDigest(): Promise<void> { return this.mutate((doc) => ({ ...doc, digest: this.digest })); }
  add(items: Annotation[]): Promise<void> { return this.mutate((doc) => ({ ...doc, annotations: [...doc.annotations.filter((a) => !items.some((b) => b.id === a.id)), ...items] })); }
  restore(items: Annotation[]): Promise<void> { return this.add(items); }
  update(id: string, patch: Partial<Annotation>): Promise<void> { return this.mutate((doc) => ({ ...doc, annotations: doc.annotations.map((a) => a.id === id ? { ...a, ...patch, id: a.id } : a) })); }
  remove(ids: string[]): Promise<void> { return this.mutate((doc) => ({ ...doc, annotations: doc.annotations.filter((a) => !ids.includes(a.id)) })); }
  destroy(): void { this.closed = true; this.unlisten?.(); this.unlisten = null; }
}
