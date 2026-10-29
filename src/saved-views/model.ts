import type { FilterModel } from "../properties/filter-query";
import { filterNotes } from "../properties/filter-query";
import type { IndexedNote } from "../links/index";
export type SavedView = { id: string; name: string; folder: string; filter: FilterModel; relativeDate?: "today" | "this-week"; sort: "path" | "title" | "date"; descending: boolean };
export function copyFilter(filter: FilterModel): FilterModel { return { ...filter, tags: filter.tags.map(t => ({ ...t })), rows: filter.rows.map(r => ({ ...r })) }; }
export function validFilter(value: unknown): value is FilterModel {
  if (!value || typeof value !== "object") return false;
  const f = value as FilterModel;
  return ["all", "any"].includes(f.mode) && (f.folder === null || typeof f.folder === "string") && Array.isArray(f.tags) && Array.isArray(f.rows) && f.tags.length + f.rows.length <= 100 && f.tags.every(t => t && typeof t.key === "string" && t.key.length <= 200 && typeof t.exclude === "boolean") && f.rows.every(r => r && typeof r.key === "string" && r.key.length <= 200 && ["is", "contains", "before", "after", "is set"].includes(r.op) && typeof r.value === "string" && r.value.length <= 2000);
}
export function validSavedView(value: unknown): value is SavedView {
  if (!value || typeof value !== "object") return false;
  const v = value as SavedView;
  return typeof v.id === "string" && v.id.length > 0 && v.id.length <= 100 && typeof v.name === "string" && !!v.name.trim() && v.name.length <= 120 && typeof v.folder === "string" && !!v.folder && validFilter(v.filter) && ["path", "title", "date"].includes(v.sort) && typeof v.descending === "boolean" && (!v.relativeDate || ["today", "this-week"].includes(v.relativeDate));
}
export function relativeDateRange(preset: "today" | "this-week", now: Date): [string, string] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "this-week") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start); if (preset === "this-week") end.setDate(end.getDate() + 6);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return [iso(start), iso(end)];
}
export function evaluateSavedView(notes: IndexedNote[], view: SavedView, now = new Date()): IndexedNote[] {
  const filter = copyFilter(view.filter);
  if (filter.folder) filter.folder = `${view.folder.replace(/\/$/, "")}/${filter.folder}`;
  let matches = filterNotes(notes, filter);
  if (view.relativeDate) { const [start, end] = relativeDateRange(view.relativeDate, now); matches = matches.filter(n => typeof n.properties?.date === "string" && n.properties.date >= start && n.properties.date <= end); }
  return matches.sort((a, b) => {
    const key = (n: IndexedNote) => view.sort === "date" ? (typeof n.properties?.date === "string" ? n.properties.date : "") : view.sort === "title" ? n.path.split("/").pop()! : n.path;
    const av = key(a), bv = key(b); if (!av || !bv) return av ? -1 : bv ? 1 : a.path.localeCompare(b.path);
    return av.localeCompare(bv) * (view.descending ? -1 : 1) || a.path.localeCompare(b.path);
  });
}
