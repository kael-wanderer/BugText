import { describe, expect, it } from "vitest";
import { SearchRun } from "../search-run";

describe("search run", () => {
  it("reports limits and stopped progress", () => {
    const run = new SearchRun();
    run.phase = "stopped"; run.pdfTotal = 9; run.pdfDone = 3;
    run.walkLimit = true; run.hitLimit = true;
    expect(run.status).toBe("Stopped · No results · 6 PDFs not searched");
    expect(run.notes).toContain("Searched the first 5,000 files of this folder.");
    expect(run.notes).toContain("Showing the first 500 results. Refine the search to see the rest.");
  });
  it("says no results and uses singular counts", () => {
    const run = new SearchRun();
    run.phase = "done";
    expect(run.status).toBe("No results");
    run.add([{ path: "/a", relative: "a", line: 1, snippet: "x", match_start: 0, match_end: 1 }]);
    expect(run.status).toBe("1 result in 1 file");
    run.phase = "stopped"; run.pdfTotal = 2; run.pdfDone = 1;
    expect(run.status).toBe("Stopped · 1 result in 1 file · 1 PDF not searched");
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
