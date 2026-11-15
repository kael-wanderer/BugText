import { describe, expect, it } from "vitest";
import { isoWeek, outputPath } from "../recipes/path";

const now = new Date(2026, 10, 12);
const OUTSIDE = { error: "The output path must be a Markdown note inside this folder." };

describe("isoWeek", () => {
  it("gives the ISO week and week-year", () => {
    expect(isoWeek(new Date(2026, 10, 12))).toEqual({ year: 2026, week: 46 });
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 });
  });
});

describe("outputPath", () => {
  it("fills placeholders", () => {
    expect(outputPath("Reviews/{{year}}-W{{week}}.md", { now, current: null })).toEqual({ relative: "Reviews/2026-W46.md" });
    expect(outputPath("{{date}} notes", { now, current: null })).toEqual({ relative: "2026-11-12 notes.md" });
    expect(outputPath("{{dir}}/{{title}} summary.md", { now, current: "meetings/Kickoff.md" })).toEqual({ relative: "meetings/Kickoff summary.md" });
    expect(outputPath("{{dir}}/{{title}} summary.md", { now, current: "Kickoff.md" })).toEqual({ relative: "Kickoff summary.md" });
    expect(outputPath("{{year}}/{{month}}/{{day}}.md", { now, current: null })).toEqual({ relative: "2026/11/12.md" });
  });

  it("uses the ISO week-year only with {{week}}", () => {
    const jan1 = new Date(2027, 0, 1);
    expect(outputPath("{{year}}-W{{week}}", { now: jan1, current: null })).toEqual({ relative: "2026-W53.md" });
    expect(outputPath("{{year}}", { now: jan1, current: null })).toEqual({ relative: "2027.md" });
  });

  it("refuses outside paths", () => {
    for (const pattern of ["../x.md", "/tmp/x.md", "a\\b.md", "a//b.md", "x.txt", "./x.md"])
      expect(outputPath(pattern, { now, current: null }), pattern).toEqual(OUTSIDE);
    expect(outputPath("{{dir}}/{{title}}.md", { now, current: "a/../../b.md" })).toEqual(OUTSIDE);
  });

  it("does not treat dots in a name as an extension", () => {
    expect(outputPath("Q3.5 plan summary", { now, current: null })).toEqual({ relative: "Q3.5 plan summary.md" });
    expect(outputPath("v1.2", { now, current: null })).toEqual({ relative: "v1.2.md" });
    expect(outputPath("Notes.MD", { now, current: null })).toEqual({ relative: "Notes.MD" });
  });

  it("keeps a value holding braces literal", () => {
    expect(outputPath("{{title}}.md", { now, current: "{{date}}.md" })).toEqual({ relative: "{{date}}.md" });
  });

  it("refuses title without a current note", () => {
    expect(outputPath("{{title}}.md", { now, current: null })).toEqual({ error: "This recipe's output path uses the current note. Add Current note to its inputs." });
  });
});
