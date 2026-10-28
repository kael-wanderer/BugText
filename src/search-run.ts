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
