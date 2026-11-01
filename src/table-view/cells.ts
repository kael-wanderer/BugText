import type { IndexedNote } from "../links/index";
import { validKey } from "../properties/edit";
import { validDate } from "../properties/filter-query";
import { propertyKind, type PropertyKind } from "../properties/parse";
import type { Column } from "./model";

export type CellKind = PropertyKind;
export type Parsed = { ok: true; value: string | number | boolean | string[] | undefined } | { ok: false; message: string };

export function columnKind(notes: IndexedNote[], key: string): CellKind {
  for (const note of notes) {
    if (note.propertyError) continue;
    const value = note.properties?.[key];
    if (value != null && value !== "" && (!Array.isArray(value) || value.length)) return propertyKind(value);
  }
  return "text";
}
export function editableCell(note: IndexedNote, column: Column): boolean {
  if (column.base || !column.key || note.propertyError) return false;
  const value = note.properties?.[column.key];
  return value == null || (Array.isArray(value) ? value.every(v => typeof v === "string") : typeof value !== "object");
}
export function validColumnKey(key: string): boolean { return validKey(key); }
export function parseCellInput(kind: CellKind, input: string | string[] | boolean): Parsed {
  if (kind === "checkbox") return { ok: true, value: Boolean(input) };
  if (kind === "list") {
    const values = (Array.isArray(input) ? input : [String(input)]).map(v => v.trim()).filter(Boolean);
    return { ok: true, value: values.length ? [...new Set(values)] : undefined };
  }
  const text = String(input);
  if (!text.trim()) return { ok: true, value: undefined };
  if (kind === "number") {
    const value = Number(text.trim());
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, message: "Enter a number." };
  }
  if (kind === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !validDate(text))) return { ok: false, message: "Enter a date as YYYY-MM-DD." };
  return { ok: true, value: text };
}
