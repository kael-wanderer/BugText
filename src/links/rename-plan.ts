import { formatLinkTarget } from "./parse";
import { resolveLink } from "./resolve";
import type { IndexedNote } from "./index";
export type LinkEdit = { from: number; to: number; insert: string; line: number; before: string; inside: boolean; checked: boolean };
export type NoteEdits = { path: string; source: string; edits: LinkEdit[] };
export function movedPath(path: string, from: string, to: string): string {
  return path === from || path.startsWith(from + "/") ? to + path.slice(from.length) : path;
}
export function planRename(notes: IndexedNote[], from: string, to: string, folder: string): NoteEdits[] {
  const plans: NoteEdits[] = [];
  for (const note of notes) {
    const path = movedPath(note.path, from, to);
    const edits: LinkEdit[] = [];
    for (const link of note.links) {
      const resolved = resolveLink(link.target, note.path, folder);
      if (!resolved.path || (resolved.kind !== "note" && resolved.kind !== "file")) continue;
      if (!resolved.path.startsWith(folder.replace(/\/$/, "") + "/") || /^(?:\/|[a-z]:)/i.test(link.target)) continue;
      const target = movedPath(resolved.path, from, to);
      if (path === note.path && target === resolved.path) continue;
      // Same-note anchors remain same-note anchors after a move.
      if (link.target.startsWith("#")) continue;
      const hash = link.target.indexOf("#");
      const anchor = hash < 0 ? "" : link.target.slice(hash);
      let insert = formatLinkTarget(path, target).replace(/^<(.*)>$/, "$1");
      if (/%[\da-f]{2}/i.test(link.target)) insert = insert.split("/").map((part) => encodeURIComponent(part)).join("/");
      insert += anchor;
      const angle = note.source[link.start - 1] === "<";
      if (!angle && /[ ()]/.test(insert)) insert = `<${insert}>`;
      if (insert === link.target) continue;
      edits.push({ from: link.start, to: link.end, insert, line: link.line, before: link.target, inside: path !== note.path, checked: true });
    }
    if (edits.length) plans.push({ path, source: note.source, edits });
  }
  return plans;
}
export function editedText(source: string, edits: LinkEdit[]): string {
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) source = source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
  return source;
}
export type RenameWriter = {
  onFailure?: () => void;
  findOpen: (path: string) => { text: string; apply: (changes: { from: number; to: number; insert: string }[]) => void } | null;
  read: (path: string) => Promise<string>;
  snapshot: (path: string, source: string) => Promise<unknown>;
  write: (path: string, source: string, expected: string) => Promise<void>;
};
export async function applyRename(plans: NoteEdits[], folder: string, deps: RenameWriter) {
  let skipped = 0;
  for (const plan of plans) {
    const edits = plan.edits.filter((e) => e.checked);
    if (!edits.length) continue;
    const root = folder.replace(/\\/g, "/").replace(/\/+$/, "");
    const path = plan.path.replace(/\\/g, "/");
    if (!path.startsWith((root || "") + "/") || path.split("/").some(part => part === "." || part === "..")) { skipped++; continue; }
    const open = deps.findOpen(plan.path);
    if (open) {
      if (open.text !== plan.source) { skipped++; continue; }
      open.apply(edits.map(({ from, to, insert }) => ({ from, to, insert })));
      continue;
    }
    try {
      if (await deps.read(plan.path) !== plan.source) { skipped++; continue; }
      await deps.snapshot(plan.path, plan.source);
      if (deps.findOpen(plan.path) || await deps.read(plan.path) !== plan.source) { skipped++; continue; }
      await deps.write(plan.path, editedText(plan.source, edits), plan.source);
    } catch { skipped++; deps.onFailure?.(); }
  }
  return skipped;
}
