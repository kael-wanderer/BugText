import { invoke } from "@tauri-apps/api/core";
import { markdownOutline, type OutlineHeading } from "../outline";
import { headingAnchors, noteLinks, type NoteLink } from "./parse";
import { resolveLink } from "./resolve";
import { loadProperties, propertiesModule } from "../properties/loader";
import { bodyTags, frontMatterTags, tagKey } from "../properties/tags";

export type IndexedNote = { path: string; source: string; links: NoteLink[]; headings: OutlineHeading[]; tags: string[]; properties: Record<string, unknown> | null; propertyError?: { line: number; message: string } };
export type LinkScan = { notes: IndexedNote[]; skipped: string[]; stamps?: Record<string, string>; removed?: string[]; walked?: number; capped?: boolean };
export type LinkIndex = ReturnType<typeof createLinkIndex>;
// Properties need the lazily loaded parser: await loadProperties() before calling this (ensure() does).
export function parseNote(path: string, source: string): IndexedNote {
  return withProperties({ path, source, links: noteLinks(source), headings: markdownOutline(source) });
}
function withProperties(note: Pick<IndexedNote, "path" | "source" | "links" | "headings">): IndexedNote {
  const result = propertiesModule()?.readProperties(note.source) ?? null;
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
  let walked = 0, capped = false;
  let backlinksDirty = true;
  let backlinksMap = new Map<string, (ReturnType<typeof outgoing>[number] & { path: string; context: string })[]>();
  const versions = new Map<string, number>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  const contains = (path: string) => folder !== null && path.startsWith(folder.replace(/\/$/, "") + "/");
  function apply(path: string, text: string | null) {
    backlinksDirty = true;
    notes.delete(path);
    if (text !== null && /\.(md|markdown)$/i.test(path)) notes.set(path, parseNote(path, text));
  }
  function setFolder(next: string | null) {
    if (folder === next) return;
    backlinksDirty = true;
    generation++; folder = next; ready = false; building = null; notes = new Map(); pending = new Map(); skipped = []; stamps = {}; walked = 0; capped = false; refreshing = false; versions.clear(); notify();
  }
  async function ensure(next = folder): Promise<void> {
    setFolder(next);
    if (!propertiesModule()) await loadProperties();
    if (!folder || ready) return;
    if (!building) {
      const current = generation;
      const root = folder;
      const promise = scan(root).then((result) => {
        if (current !== generation) return;
        stamps = result.stamps ?? {};
        walked = result.walked ?? 0; capped = result.capped ?? false;
        backlinksDirty = true;
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
    if (!/\.(md|markdown)$/i.test(path) && !notes.has(path)) return;
    if (ready && (text === null ? !notes.has(path) : notes.get(path)?.source === text)) return;
    versions.set(path, (versions.get(path) ?? 0) + 1);
    if (building) pending.set(path, text);
    if (ready) { apply(path, text); notify(); }
  }
  function outgoing(path: string, source?: string) {
    const note = source === undefined ? notes.get(path) : { path, source, links: noteLinks(source), headings: markdownOutline(source) };
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
        let changed = false;
        const removed = result.removed ?? Object.keys(stamps).filter(path => !(path in next));
        for (const path of removed) if (versions.get(path) === before.get(path)) changed = notes.delete(path) || changed;
        for (const note of result.notes) if (versions.get(note.path) === before.get(note.path) && notes.get(note.path)?.source !== note.source) { notes.set(note.path, withProperties(note)); changed = true; }
        for (const path of result.skipped) if (versions.get(path) === before.get(path)) changed = notes.delete(path) || changed;
        const nextSkipped = [...result.skipped].sort();
        const previousSkipped = [...skipped].sort();
        if (nextSkipped.length !== previousSkipped.length || nextSkipped.some((path, i) => path !== previousSkipped[i])) changed = true;
        if ((result.walked ?? walked) !== walked || (result.capped ?? capped) !== capped) changed = true;
        walked = result.walked ?? walked; capped = result.capped ?? capped;
        if (result.removed) { stamps = { ...stamps, ...next }; for (const path of removed) delete stamps[path]; }
        else stamps = next;
        skipped = nextSkipped;
        for (const path of versions.keys()) if (!(path in stamps)) versions.delete(path);
        if (changed) { backlinksDirty = true; notify(); }
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
      if (backlinksDirty) {
        backlinksMap = new Map();
        for (const note of notes.values()) {
          const lines = note.source.split("\n");
          for (const link of outgoing(note.path)) {
            if (link.resolved.kind !== "note" || !link.resolved.path) continue;
            const entries = backlinksMap.get(link.resolved.path) ?? [];
            entries.push({ ...link, path: note.path, context: lines[link.line - 1] ?? "" });
            backlinksMap.set(link.resolved.path, entries);
          }
        }
        backlinksDirty = false;
      }
      return backlinksMap.get(path) ?? [];
    },
    notes: () => [...notes.values()],
    get: (path: string) => notes.get(path),
    get folder() { return folder; },
    get ready() { return ready; },
    get skipped() { return skipped; },
    get walked() { return walked; },
    get capped() { return capped; },
    get markdownCount() { return Object.keys(stamps).length; },
    subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
