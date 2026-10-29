// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { matchingNotes, columnsFor, sortNotes } from "../table-view/model";
import { createTableSurface } from "../table-view/surface";
import type { IndexedNote } from "../links/index";
const note = (path: string, properties: Record<string, unknown> | null = {}): IndexedNote => ({ path, properties, tags: [], source: "", links: [], headings: [] });
const filter = { tags: [], rows: [], folder: null, mode: "all" as const };
describe("property table", () => {
  it("discovers first-seen unique keys, ignoring invalid YAML properties", () => {
    expect(columnsFor([note("a", { z: 1, a: 2 }), note("b", { a: 3, b: 4 }), { ...note("c", { bad: 1 }), propertyError: { line: 2, message: "Invalid YAML properties" } }]).map(c => c.label)).toEqual(["Title", "Path", "Tags", "z", "a", "b"]);
  });
  for (const [kind, values] of [["text", ["b", "a", "c"]], ["number", [10, 2, 30]], ["date", ["2026-02-01", "2026-01-01", "2026-03-01"]]] as const) {
    for (const descending of [false, true]) it(`sorts ${kind} ${descending} with empty values last`, () => {
      const notes = values.map((value, i) => note(String(i), { x: value }));
      const empty = [note("null", { x: null }), note("missing"), note("blank", { x: "" }), note("list", { x: [] })];
      const sorted = sortNotes([...empty, ...notes], { label: "x", key: "x" }, descending);
      expect(sorted.slice(0, 3).map(n => n.path)).toEqual(descending ? ["2", "0", "1"] : ["1", "0", "2"]);
      expect(sorted.slice(3)).toEqual(empty);
    });
  }
  it("rejects malformed filters and excludes nonmatches", () => {
    expect(matchingNotes([note("a")], { ...filter, mode: "bad" } as never)).toEqual([]);
    expect(matchingNotes([note("/other/a")], { ...filter, folder: "/notes" })).toEqual([]);
    expect(matchingNotes([note("a", { date: "2026-02-30" })], { ...filter, rows: [{ key: "date", op: "before", value: "2026-03-01" }] })).toEqual([]);
  });
  it("renders errors and hostile values literally and opens by keyboard", () => {
    const host = document.createElement("div"); let opened = "";
    const table = createTableSurface(host, path => { opened = path; });
    const bad = { ...note("bad.md", { x: "must stay blank" }), propertyError: { line: 3, message: "Invalid YAML properties" } };
    const html = '<img src=x onerror=alert(1)>';
    table.update(matchingNotes([bad, note("safe.md", { [html]: html })], filter), "/notes");
    expect(host.textContent).toContain("line 3: Invalid YAML properties");
    expect(host.textContent).not.toContain("must stay blank");
    expect(host.textContent).toContain(html); expect(host.querySelector("img")).toBeNull();
    host.querySelector("tbody tr")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); expect(opened).toBe("bad.md");
  });
  it("builds 2000 notes and renders a bounded first batch", () => {
    const notes = Array.from({ length: 2000 }, (_, i) => note(`/notes/${i}.md`, { status: "active", count: i, date: "2026-10-29" }));
    const host = document.createElement("div"); const start = performance.now();
    createTableSurface(host, () => {}).update(matchingNotes(notes, filter), "/notes");
    const elapsed = performance.now() - start; console.log(`Table 2000-note model + 500 DOM rows: ${elapsed.toFixed(2)} ms`);
    expect(elapsed).toBeLessThan(2000); expect(host.querySelectorAll("tbody tr")).toHaveLength(500);
    Array.from(host.querySelectorAll("button")).find(b => b.textContent?.startsWith("Show more"))!.click();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(500);
    expect(host.querySelector("tbody")!.textContent).toContain("/notes/500.md");
  });
});
