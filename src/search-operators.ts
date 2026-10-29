import type { IndexedNote } from "./links/index";
import { matchNote, validDate, type FilterModel } from "./properties/filter-query";

export type SearchOperators = { tags: string[]; props: { key: string; op: "is" | "set"; value?: string }[]; path: string | null; before: { key: string; date: string }[]; after: { key: string; date: string }[]; text: string };
export function parseSearchOperators(query: string): SearchOperators {
  const result: SearchOperators = { tags: [], props: [], path: null, before: [], after: [], text: "" };
  const text: string[] = [];
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    if (/["']/.test(token)) { text.push(token); continue; }
    const tag = /^tag:([^:]+)$/i.exec(token), prop = /^prop:([^:=]+)(?:=(.+))?$/i.exec(token), path = /^path:(.+)$/i.exec(token), date = /^(before|after):(\d{4}-\d{2}-\d{2})(?::([^:]+))?$/i.exec(token);
    if (tag && tag[1].replace(/^#/, "")) result.tags.push(tag[1].replace(/^#/, ""));
    else if (prop) result.props.push({ key: prop[1], op: prop[2] === undefined ? "set" : "is", value: prop[2] });
    else if (path) result.path = path[1];
    else if (date && validDate(date[2])) result[date[1].toLowerCase() as "before" | "after"].push({ key: date[3] ?? "date", date: date[2] });
    else text.push(token);
  }
  result.text = text.join(" "); return result;
}
export function hasOperators(ops: SearchOperators): boolean { return !!(ops.tags.length || ops.props.length || ops.path || ops.before.length || ops.after.length); }
export function hasMetadataOperators(ops: SearchOperators): boolean { return !!(ops.tags.length || ops.props.length || ops.before.length || ops.after.length); }
export function pathMatches(path: string, prefix: string | null): boolean { return !prefix || path.replace(/\\/g, "/").startsWith(prefix.replace(/\\/g, "/")); }
export function operatorFilter(ops: SearchOperators, note: IndexedNote, relativePath = note.path): boolean {
  if (!pathMatches(relativePath, ops.path) || (note.propertyError && hasMetadataOperators(ops))) return false;
  const model: FilterModel = { mode: "all", folder: null, tags: ops.tags.map(key => ({ key, exclude: false })), rows: [
    ...ops.props.map(p => ({ key: p.key, op: p.op === "set" ? "is set" as const : "is" as const, value: p.value ?? "" })),
    ...ops.before.map(p => ({ key: p.key, op: "before" as const, value: p.date })),
    ...ops.after.map(p => ({ key: p.key, op: "after" as const, value: p.date })),
  ] };
  return matchNote(note, model);
}
