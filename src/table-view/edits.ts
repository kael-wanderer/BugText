import type { IndexedNote } from "../links/index";
import { removeProperty, setProperty, type PropertyEdit } from "../properties/edit";
import { readProperties } from "../properties/parse";

export type TableEdit = { key: string; value: unknown | undefined };
export type Skip = { path: string; reason: string };
export type EditDeps = {
  folder: string;
  findOpen(path: string): { text: string; apply(change: PropertyEdit): void } | null;
  read(path: string): Promise<string>;
  snapshot(path: string, text: string): Promise<unknown>;
  write(path: string, contents: string, expected: string): Promise<void>;
};
export async function applyTableEdit(notes: IndexedNote[], edit: TableEdit, deps: EditDeps): Promise<{ changed: string[]; skipped: Skip[] }> {
  const changed: string[] = [], skipped: Skip[] = [];
  const skip = (path: string, reason: string) => skipped.push({ path, reason });
  if (notes.length > 500) return { changed, skipped: notes.map(note => ({ path: note.path, reason: "Too many notes for one edit." })) };
  for (const note of notes) {
    const path = note.path.replace(/\\/g, "/"), root = deps.folder.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!path.startsWith(root + "/") || path.split("/").some(part => part === "." || part === "..")) { skip(note.path, "Outside the open folder."); continue; }
    if (note.propertyError) { skip(note.path, "Invalid YAML properties."); continue; }
    try {
      const open = deps.findOpen(note.path);
      const source = open ? open.text : await deps.read(note.path);
      if (!open && source !== note.source) { skip(note.path, "Changed on disk since the table loaded."); continue; }
      const parsed = readProperties(source);
      if (parsed && !parsed.ok) { skip(note.path, "Invalid YAML properties."); continue; }
      const props = parsed?.ok ? parsed.props : {};
      if (open && JSON.stringify(props[edit.key]) !== JSON.stringify(note.properties?.[edit.key])) { skip(note.path, "Changed since the table loaded."); continue; }
      if (edit.value === undefined && !Object.prototype.hasOwnProperty.call(props, edit.key)) continue;
      const change = edit.value === undefined ? removeProperty(source, edit.key) : setProperty(source, edit.key, edit.value);
      if (!change) { skip(note.path, "Could not change this property safely."); continue; }
      const next = source.slice(0, change.from) + change.insert + source.slice(change.to);
      if (next === source) continue;
      if (open) open.apply(change);
      else {
        await deps.snapshot(note.path, source);
        if (deps.findOpen(note.path) || await deps.read(note.path) !== source) { skip(note.path, "Changed on disk since the table loaded."); continue; }
        await deps.write(note.path, next, source);
      }
      changed.push(note.path);
    } catch { skip(note.path, "Could not write this note."); }
  }
  return { changed, skipped };
}
