import type { SearchHit, SearchResult } from "./filesys";

export type SearchPhase = "idle" | "text" | "pdf" | "done" | "stopped" | "error";
export class SearchRun {
  phase: SearchPhase = "idle";
  hits: SearchHit[] = [];
  skipped: { relative: string; reason: string }[] = [];
  walkLimit = false;
  hitLimit = false;
  pdfTotal = 0;
  pdfDone = 0;
  pdfFailures = 0;
  error = "";
  add(hits: SearchHit[]): void {
    this.hits.push(...hits.slice(0, 500 - this.hits.length));
    if (this.hits.length >= 500) this.hitLimit = true;
  }
  text(result: SearchResult): void {
    this.add(result.hits);
    this.skipped.push(...result.skipped);
    this.walkLimit = result.walk_limit;
    this.hitLimit ||= result.hit_limit;
  }
  get status(): string {
    if (this.phase === "text") return "Searching…";
    if (this.phase === "error") return "Invalid regular expression";
    const files = new Set(this.hits.map((h) => h.relative)).size;
    const count = this.hits.length
      ? `${this.hits.length} result${this.hits.length === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"}`
      : "No results";
    const left = this.pdfTotal - this.pdfDone;
    return this.phase === "stopped" ? `Stopped · ${count} · ${left} PDF${left === 1 ? "" : "s"} not searched` : count;
  }
  get notes(): string[] {
    const notes: string[] = [];
    if (this.hitLimit) notes.push("Showing the first 500 results. Refine the search to see the rest.");
    if (this.walkLimit) notes.push("Searched the first 5,000 files of this folder.");
    if (this.pdfTotal > 0 && this.pdfFailures === this.pdfTotal) notes.push("PDF search unavailable");
    if (this.error) notes.push(this.error);
    return notes;
  }
}

import { invoke } from "@tauri-apps/api/core";
import type { SearchOptions } from "./filesys";
import type { LinkIndex } from "./links/index";
import { hasMetadataOperators, operatorFilter, pathMatches, type SearchOperators } from "./search-operators";
import { searchExpression } from "./search-match";

/** Search only operator-selected files, yielding between batches to keep typing responsive. */
export async function searchOperatorFiles(folder: string, files: string[], index: LinkIndex, ops: SearchOperators, options: SearchOptions, current: () => boolean): Promise<SearchResult> {
  const result: SearchResult = { hits: [], files_searched: 0, skipped: [], walk_limit: files.length > 5000, hit_limit: false, cancelled: false };
  const expression = ops.text ? searchExpression(ops.text, options) : null;
  if (ops.text && !expression) throw new Error("Invalid regular expression");
  const root = folder.replace(/[\\/]$/, "");
  const byPath = new Map(index.notes().map(note => [note.path, note]));
  const candidates = hasMetadataOperators(ops)
    ? index.notes().filter(note => operatorFilter(ops, note, note.path.slice(root.length + 1))).map(note => note.path.slice(root.length + 1))
    : files.filter(path => pathMatches(path, ops.path));
  for (const [i, relative] of candidates.slice(0, 5000).entries()) {
    if (!current()) { result.cancelled = true; break; }
    if (i && i % 25 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (result.hits.length >= 500) { result.hit_limit = true; break; }
    const path = `${root}/${relative}`;
    if (!ops.text) { result.hits.push({ path, relative, line: 1, snippet: "", match_start: 0, match_end: 0 }); continue; }
    if (/\.pdf$/i.test(relative)) continue;
    let text = byPath.get(path)?.source;
    if (text === undefined) {
      try { text = await invoke<string>("read_file", { path }); }
      catch { result.skipped.push({ relative, reason: "unreadable" }); continue; }
    }
    if (!current()) { result.cancelled = true; break; }
    if (text.length > 2 * 1024 * 1024 || text.includes("\0")) { result.skipped.push({ relative, reason: text.includes("\0") ? "not_text" : "too_large" }); continue; }
    result.files_searched++;
    const lines = text.split(/\r?\n/);
    for (let line = 0; line < lines.length && result.hits.length < 500; line++) {
      expression!.lastIndex = 0; const found = expression!.exec(lines[line]); if (!found) continue;
      const leading = lines[line].length - lines[line].trimStart().length; const snippet = lines[line].trim().slice(0, 200);
      result.hits.push({ path, relative, line: line + 1, snippet, match_start: Math.max(0, found.index - leading), match_end: Math.max(0, found.index + found[0].length - leading) });
    }
  }
  return result;
}
