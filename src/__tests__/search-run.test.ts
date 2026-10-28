import { describe, expect, it } from "vitest";
import { SearchRun } from "../search-run";

describe("search run", () => {
  it("reports limits and stopped progress", () => {
    const run = new SearchRun();
    run.phase = "stopped"; run.pdfTotal = 9; run.pdfDone = 3;
    run.walkLimit = true; run.hitLimit = true;
    expect(run.status).toBe("Stopped · 0 results in 0 files · 6 PDFs not searched");
    expect(run.notes).toContain("Searched the first 5,000 files of this folder.");
    expect(run.notes).toContain("Showing the first 500 results. Refine the search to see the rest.");
  });
  it("caps accumulated text and PDF hits at 500", () => {
    const run = new SearchRun();
    const hit = { path: "/a", relative: "a", line: 1, snippet: "x", match_start: 0, match_end: 1 };
    run.add(Array.from({ length: 499 }, () => hit));
    run.add([hit, hit]);
    expect(run.hits).toHaveLength(500);
    expect(run.hitLimit).toBe(true);
  });
});
