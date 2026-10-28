import { describe, expect, it } from "vitest";
import { SearchRun } from "../search-run";

describe("search run", () => {
  it("reports limits, skipped overflow and stopped progress", () => {
    const run = new SearchRun();
    run.phase = "stopped"; run.pdfTotal = 9; run.pdfDone = 3;
    run.walkLimit = true; run.hitLimit = true;
    expect(run.status).toBe("Stopped · 0 results in 0 files · 6 PDFs not searched");
    expect(run.notes).toContain("Searched the first 5,000 files of this folder.");
    expect(run.notes).toContain("Showing the first 500 results. Refine the search to see the rest.");
  });
});
