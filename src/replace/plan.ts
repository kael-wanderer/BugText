import { matchesContextGlob } from "../ai/context-exclude";

export type ReplaceMatch = { start: number; end: number; line: number; line_text: string; col_start: number; col_end: number; replacement: string };
export type ReplaceFile = { relative: string; source: string; matches: ReplaceMatch[] };
export type ReplacePreview = { files: ReplaceFile[]; skipped: { relative: string; reason: string }[]; multiline: number; too_many: boolean; cancelled: boolean };
export type ReplaceSelection = boolean[][];
export type UndoRecord = { path: string; before: string; after: string; open: boolean };
export function filterByGlobs(relatives: string[], include: string, exclude: string): string[] {
  const parse = (s: string) => s.split(",").map(v => v.trim()).filter(Boolean);
  const includes = parse(include), excludes = parse(exclude);
  return relatives.filter(path => (!includes.length || includes.some(p => matchesContextGlob(path, p))) && !excludes.some(p => matchesContextGlob(path, p)));
}
export function counts(selection: ReplaceSelection): { matches: number; files: number } {
  return { matches: selection.reduce((n, row) => n + row.filter(Boolean).length, 0), files: selection.filter(row => row.some(Boolean)).length };
}
export function toChanges(matches: ReplaceMatch[]): { from: number; to: number; insert: string }[] {
  return matches.map(m => ({ from: m.start, to: m.end, insert: m.replacement }));
}
export function applyMatches(source: string, matches: ReplaceMatch[]): string {
  for (const m of [...matches].sort((a, b) => b.start - a.start)) source = source.slice(0, m.start) + m.replacement + source.slice(m.end);
  return source;
}
export function trimAround(line: string, colStart: number, colEnd: number, width = 80): { text: string; start: number; end: number } {
  const start = Math.max(0, Math.min(colStart - Math.floor((width - (colEnd - colStart)) / 2), line.length - width));
  const end = Math.min(line.length, Math.max(start + width, colEnd));
  return { text: (start ? "…" : "") + line.slice(start, end) + (end < line.length ? "…" : ""), start: colStart - start + (start ? 1 : 0), end: colEnd - start + (start ? 1 : 0) };
}
