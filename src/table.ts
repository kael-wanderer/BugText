import { markdownCodeLines } from "./markdown-blocks";
import { displayWidth } from "./text-width";

export type TableBlock = { start: number; end: number; rows: string[][]; lines: string[] };
export function splitCells(line: string): string[] {
  let value = line.trim(); if (value.startsWith("|")) value = value.slice(1); if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);
  const cells: string[] = []; let cell = "", escaped = false;
  for (const c of value) { if (c === "|" && !escaped) { cells.push(cell.trim()); cell = ""; } else { cell += c; if (c === "\\") escaped = !escaped; else escaped = false; } }
  cells.push(cell.trim()); return cells;
}
const delimiter = (line: string) => splitCells(line).length > 0 && splitCells(line).every((c) => /^:?-{3,}:?$/.test(c));
export function findTable(source: string, lineNumber: number): TableBlock | null {
  const lines = source.split(/\r?\n/), blocked = markdownCodeLines(source); let a = lineNumber - 1;
  while (a > 0 && lines[a - 1].includes("|") && !blocked[a - 1]) a--;
  let b = a; while (b < lines.length && lines[b].includes("|") && !blocked[b]) b++;
  if (b - a < 2 || !delimiter(lines[a + 1])) return null;
  return { start: a + 1, end: b, lines: lines.slice(a, b), rows: lines.slice(a, b).map(splitCells) };
}
export function formatTable(rows: string[][]): string {
  if (!rows.length) return ""; const width = Math.max(rows[0].length, ...rows.map((r) => r.length));
  const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
  if (normalized.length < 2) normalized.push(Array(width).fill("---"));
  else normalized[1] = normalized[1].map((c) => /^:?-{3,}:?$/.test(c) ? c : "---");
  const widths = Array.from({ length: width }, (_, col) => Math.max(3, ...normalized.map((row) => displayWidth(row[col] ?? ""))));
  return normalized.map((row, ri) => "| " + row.map((cell, i) => {
    const raw = cell || (ri === 1 ? "---" : ""); const pad = Math.max(0, widths[i] - displayWidth(raw));
    if (ri === 1 && raw.startsWith(":") && raw.endsWith(":")) return raw.slice(0, -1) + "-".repeat(pad) + ":";
    if (ri === 1 && raw.endsWith(":")) return raw.slice(0, -1) + "-".repeat(pad) + ":";
    return raw + " ".repeat(pad);
  }).join(" | ") + " |").join("\n");
}
