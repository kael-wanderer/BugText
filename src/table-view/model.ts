import type { IndexedNote } from "../links/index";
import { matchNote, validDate, type FilterModel } from "../properties/filter-query";
import { validFilter } from "../saved-views/model";

export type Column = { label: string; key?: string; base?: "title" | "path" | "tags" };
export function matchingNotes(notes: IndexedNote[], filter: FilterModel): IndexedNote[] {
  if (!validFilter(filter)) return [];
  return notes.filter(note => matchNote(note, filter));
}
export function columnsFor(notes: IndexedNote[]): Column[] {
  const keys = new Set<string>();
  for (const note of notes) if (!note.propertyError) for (const key of Object.keys(note.properties ?? {})) keys.add(key);
  return [{ label: "Title", base: "title" }, { label: "Path", base: "path" }, { label: "Tags", base: "tags" }, ...[...keys].map(key => ({ label: key, key }))];
}
export function cellValue(note: IndexedNote, column: Column): unknown {
  if (column.base === "title") return note.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
  if (column.base === "path") return note.path;
  if (column.base === "tags") return note.tags;
  return note.propertyError || !Object.prototype.hasOwnProperty.call(note.properties ?? {}, column.key!) ? null : note.properties![column.key!];
}
export function valueText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(valueText).join(", ");
  if (typeof value === "object") { try { return JSON.stringify(value); } catch { return "Unsupported value"; } }
  return String(value);
}
export function sortNotes(notes: IndexedNote[], column: Column, descending: boolean): IndexedNote[] {
  return [...notes].sort((a, b) => {
    const av = cellValue(a, column), bv = cellValue(b, column);
    const at = valueText(av), bt = valueText(bv);
    if (!at || !bt) return at ? -1 : bt ? 1 : 0;
    const result = typeof av === "number" && Number.isFinite(av) && typeof bv === "number" && Number.isFinite(bv) ? av - bv
      : validDate(at) && validDate(bt) ? (at < bt ? -1 : at > bt ? 1 : 0) : at.localeCompare(bt);
    return result * (descending ? -1 : 1);
  });
}
