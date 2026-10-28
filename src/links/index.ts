import { invoke } from "@tauri-apps/api/core";
import { markdownOutline, type OutlineHeading } from "../outline";
import { headingAnchors, noteLinks, type NoteLink } from "./parse";
import { resolveLink } from "./resolve";

export type IndexedNote = { path: string; source: string; links: NoteLink[]; headings: OutlineHeading[] };
export type LinkScan = { notes: IndexedNote[]; skipped: string[] };
export type LinkIndex = ReturnType<typeof createLinkIndex>;
export function parseNote(path: string, source: string): IndexedNote {
  return { path, source, links: noteLinks(source), headings: markdownOutline(source) };
}
export function createLinkIndex(scan = (folder: string, paths?: string[]) => invoke<LinkScan>(paths ? "scan_note_links_for" : "scan_note_links", { folder, paths })) {
  let folder: string | null = null;
  let generation = 0;
  let ready = false;
  let building: Promise<void> | null = null;
  let notes = new Map<string, IndexedNote>();
  let pending = new Map<string, string | null>();
  let skipped: string[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  const contains = (path: string) => folder !== null && path.startsWith(folder.replace(/\/$/, "") + "/");
  function apply(path: string, text: string | null) {
    notes.delete(path);
    if (text !== null && /\.(md|markdown)$/i.test(path)) notes.set(path, parseNote(path, text));
  }
  function setFolder(next: string | null) {
    if (folder === next) return;
    generation++; folder = next; ready = false; building = null; notes = new Map(); pending = new Map(); skipped = []; notify();
  }
  async function ensure(next = folder): Promise<void> {
    setFolder(next);
    if (!folder || ready) return;
    if (!building) {
      const current = generation;
      const root = folder;
      const promise = scan(root).then((result) => {
        if (current !== generation) return;
        notes = new Map(result.notes.map((note) => [note.path, note])); skipped = result.skipped;
        for (const [path, text] of pending) apply(path, text);
        pending.clear(); ready = true; notify();
      }).finally(() => { if (current === generation) building = null; });
      building = promise;
    }
    await building;
  }
  function onFileChanged(path: string, text: string | null) {
    if (!contains(path)) return;
    if (building) pending.set(path, text);
    if (ready) { apply(path, text); notify(); }
  }
  function outgoing(path: string, source?: string) {
    const note = source === undefined ? notes.get(path) : parseNote(path, source);
    return (note?.links ?? []).map((link) => {
      const resolved = resolveLink(link.target, path, folder);
      const target = resolved.path === path && note ? note : notes.get(resolved.path ?? "");
      const broken = resolved.kind !== "note" ? null : !target ? "Note not found" : resolved.anchor && !headingAnchors(target.headings).some((h) => h.anchor === resolved.anchor) ? "Heading not found" : null;
      return { ...link, resolved, broken };
    });
  }
  return {
    ensure, setFolder, onFileChanged, outgoing,
    onFileRemoved: (path: string) => onFileChanged(path, null),
    async rescan(paths: string[]) {
      if (!folder || (!ready && !building)) return;
      const root = folder; const current = generation;
      const result = await scan(root, paths);
      if (current !== generation) return;
      paths.forEach((path) => onFileChanged(path, null));
      result.notes.forEach((note) => onFileChanged(note.path, note.source));
    },
    backlinks(path: string) {
      return [...notes.values()].flatMap((note) => outgoing(note.path).filter((link) => link.resolved.kind === "note" && link.resolved.path === path).map((link) => ({ ...link, path: note.path, context: note.source.split("\n")[link.line - 1] ?? "" })));
    },
    notes: () => [...notes.values()],
    get: (path: string) => notes.get(path),
    get folder() { return folder; },
    get ready() { return ready; },
    get skipped() { return skipped; },
    subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
