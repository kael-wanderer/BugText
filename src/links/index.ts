import { invoke } from "@tauri-apps/api/core";
import { markdownOutline, type OutlineHeading } from "../outline";
import { headingAnchors, noteLinks, type NoteLink } from "./parse";
import { resolveLink } from "./resolve";
import { readProperties } from "../properties/parse";
import { bodyTags, frontMatterTags, tagKey } from "../properties/tags";

export type IndexedNote = { path: string; source: string; links: NoteLink[]; headings: OutlineHeading[]; tags: string[]; properties: Record<string, unknown> | null; propertyError?: { line: number; message: string } };
export type LinkScan = { notes: IndexedNote[]; skipped: string[]; stamps?: Record<string, string> };
export type LinkIndex = ReturnType<typeof createLinkIndex>;
export function parseNote(path: string, source: string): IndexedNote {
  return withProperties({ path, source, links: noteLinks(source), headings: markdownOutline(source) });
}
function withProperties(note: Pick<IndexedNote, "path" | "source" | "links" | "headings">): IndexedNote {
  const result = readProperties(note.source);
  const properties = result?.ok ? result.props : null;
  const seen = new Set<string>();
  const tags = [...frontMatterTags(properties), ...bodyTags(note.source)].filter((tag) => {
    const key = tagKey(tag);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return { ...note, tags, properties, ...(!result || result.ok ? {} : { propertyError: { line: result.line, message: result.error } }) };
}
export function folderTags(index: LinkIndex): Map<string, { name: string; count: number }> {
  const tags = new Map<string, { name: string; count: number }>();
  for (const note of index.notes().sort((a, b) => a.path.localeCompare(b.path))) {
    for (const name of note.tags) {
      const key = tagKey(name); const existing = tags.get(key);
      if (existing) existing.count++; else tags.set(key, { name, count: 1 });
    }
  }
  return tags;
}
export function createLinkIndex(scan = (folder: string, paths?: string[], known?: Record<string, string>) => invoke<LinkScan>(paths ? "scan_note_links_for" : "scan_note_links", { folder, paths, known })) {
  let folder: string | null = null;
  let generation = 0;
  let ready = false;
  let building: Promise<void> | null = null;
  let notes = new Map<string, IndexedNote>();
  let pending = new Map<string, string | null>();
  let skipped: string[] = [];
  let stamps: Record<string, string> = {};
  let refreshing = false;
  const versions = new Map<string, number>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  const contains = (path: string) => folder !== null && path.startsWith(folder.replace(/\/$/, "") + "/");
  function apply(path: string, text: string | null) {
    notes.delete(path);
    if (text !== null && /\.(md|markdown)$/i.test(path)) notes.set(path, parseNote(path, text));
  }
  function setFolder(next: string | null) {
    if (folder === next) return;
    generation++; folder = next; ready = false; building = null; notes = new Map(); pending = new Map(); skipped = []; stamps = {}; refreshing = false; versions.clear(); notify();
  }
  async function ensure(next = folder): Promise<void> {
    setFolder(next);
    if (!folder || ready) return;
    if (!building) {
      const current = generation;
      const root = folder;
      const promise = scan(root).then((result) => {
        if (current !== generation) return;
        stamps = result.stamps ?? {};
        notes = new Map(result.notes.map((note) => [note.path, withProperties(note)])); skipped = result.skipped;
        for (const [path, text] of pending) apply(path, text);
        pending.clear(); ready = true; notify();
      }).finally(() => { if (current === generation) building = null; });
      building = promise;
    }
    await building;
  }
  function onFileChanged(path: string, text: string | null) {
    if (!contains(path)) return;
    versions.set(path, (versions.get(path) ?? 0) + 1);
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
    async refresh() {
      if (!folder || !ready || refreshing) return;
      refreshing = true;
      const current = generation; const before = new Map(versions);
      try {
        const result = await scan(folder, undefined, stamps);
        if (current !== generation) return;
        const next = result.stamps ?? {};
        for (const path of Object.keys(stamps)) if (!(path in next) && versions.get(path) === before.get(path)) notes.delete(path);
        for (const note of result.notes) if (versions.get(note.path) === before.get(note.path)) notes.set(note.path, withProperties(note));
        for (const path of result.skipped) if (versions.get(path) === before.get(path)) notes.delete(path);
        stamps = next; skipped = result.skipped; notify();
      } finally { if (current === generation) refreshing = false; }
    },
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
