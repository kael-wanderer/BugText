import type { IndexedNote } from "../links/index";
import { tagAncestors, tagKey } from "./tags";

export type FilterModel = { tags: { key: string; exclude: boolean }[]; rows: { key: string; op: "is" | "contains" | "before" | "after" | "is set"; value: string }[]; folder: string | null; mode: "all" | "any" };
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function matchNote(note: IndexedNote, model: FilterModel): boolean {
  if (model.folder && !note.path.startsWith(model.folder.replace(/\/$/, "") + "/")) return false;
  const tags = new Set(note.tags.flatMap(tagAncestors).map(tagKey));
  const conditions = model.tags.map(tag => tag.exclude ? !tags.has(tagKey(tag.key)) : tags.has(tagKey(tag.key)));
  for (const row of model.rows) {
    const value = note.properties?.[row.key];
    const values = Array.isArray(value) ? value : [value];
    const needle = row.value.toLowerCase();
    if (row.op === "is set") conditions.push(value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0));
    else if (row.op === "before" || row.op === "after") conditions.push(values.some(v => typeof v === "string" && validDate(v) && validDate(row.value) && (row.op === "before" ? v < row.value : v > row.value)));
    else conditions.push(values.some(v => v !== null && v !== undefined && (row.op === "is" ? String(v).toLowerCase() === needle : String(v).toLowerCase().includes(needle))));
  }
  return !conditions.length || (model.mode === "all" ? conditions.every(Boolean) : conditions.some(Boolean));
}
export function filterNotes(notes: IndexedNote[], model: FilterModel): IndexedNote[] {
  return notes.filter(note => !note.propertyError && matchNote(note, model)).sort((a, b) => a.path.localeCompare(b.path));
}
export function skippedNotes(notes: IndexedNote[]) {
  return notes.flatMap(note => note.propertyError ? [{ path: note.path, ...note.propertyError }] : []);
}
