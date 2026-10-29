import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { validSavedView, type SavedView } from "./model";
export type StoreData<T> = { version: 1; revision: number; items: T[] };
export function createWorkflowStore<T>(kind: "saved-views" | "bookmarks" | "note-types", valid: (item: unknown) => item is T) {
  let data: StoreData<T> = { version: 1, revision: 0, items: [] };
  let error: string | null = null, loaded = false, generation = 0;
  const listeners = new Set<() => void>(); const notify = () => listeners.forEach(fn => fn());
  function parse(raw: unknown): StoreData<T> {
    const v = raw as StoreData<T>;
    if (!v || v.version !== 1 || !Number.isSafeInteger(v.revision) || v.revision < 0 || !Array.isArray(v.items) || v.items.length > 200 || !v.items.every(valid) || new Set(v.items.map(item => (item as {id?:string}).id)).size !== v.items.length) throw new Error("Stored definitions are invalid or from a newer version. The original file was preserved.");
    return v;
  }
  async function reload() {
    const token = ++generation;
    try { const next = parse(await invoke("read_workflow_store", { kind })); if (token !== generation) return; data = next; error = null; loaded = true; }
    catch (e) { if (token !== generation) return; error = String(e); loaded = false; }
    notify();
  }
  async function update(change: (items: T[]) => T[]) {
    if (!loaded || error) throw new Error(error ?? "Definitions have not loaded yet.");
    const next = parse({ ...data, items: change(structuredClone(data.items)) });
    try { data = parse(await invoke("write_workflow_store", { kind, expectedRevision: data.revision, items: next.items })); error = null; notify(); }
    catch (e) { await reload(); throw new Error(String(e)); }
  }
  let disposed = false; let unlisten: (() => void) | undefined;
  void listen<string>("bugtext://workflow-store-changed", event => { if (event.payload === kind) void reload(); }).then(fn => { if (disposed) fn(); else unlisten = fn; }).catch(() => {});
  return { reload, update, get items() { return data.items; }, get error() { return error; }, get loaded() { return loaded; }, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }, dispose() { disposed = true; generation++; unlisten?.(); listeners.clear(); } };
}
export function createSavedViewStore() { return createWorkflowStore<SavedView>("saved-views", validSavedView); }
export type SavedViewStore = ReturnType<typeof createSavedViewStore>;
