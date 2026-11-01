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
    host.querySelector<HTMLButtonElement>("tbody .table-title")!.click(); expect(opened).toBe("bad.md");
  });
  it("builds 2000 notes and renders a bounded first batch", () => {
    const notes = Array.from({ length: 2000 }, (_, i) => note(`/notes/${i}.md`, { status: "active", count: i, date: "2026-10-29" }));
    const host = document.createElement("div"); const start = performance.now();
    createTableSurface(host, () => {}).update(matchingNotes(notes, filter), "/notes");
    const elapsed = performance.now() - start; console.log(`Table 2000-note model + 500 DOM rows: ${elapsed.toFixed(2)} ms`);
    expect(elapsed).toBeLessThan(2000); expect(host.querySelectorAll("tbody tr")).toHaveLength(500);
    host.scrollTop = 400;
    Array.from(host.querySelectorAll("button")).find(b => b.textContent?.startsWith("Show more"))!.click();
    expect(host.scrollTop).toBe(0);
    expect(host.querySelectorAll("tbody tr")).toHaveLength(500);
    expect(host.querySelector("tbody")!.textContent).toContain("500.md");
  });
  it("keeps the rendered table when an index refresh brings the same notes", () => {
    const host = document.createElement("div");
    const notes = [note("/notes/a.md", { x: 1 }), note("/notes/b.md", { x: 2 })];
    const table = createTableSurface(host, () => {});
    table.update(notes, "/notes");
    const before = host.querySelector("table");
    table.update([...notes], "/notes");
    expect(host.querySelector("table")).toBe(before);
    table.update([notes[0], note("/notes/b.md", { x: 3 })], "/notes");
    expect(host.querySelector("table")).not.toBe(before);
  });
  it("shows paths relative to the open folder", () => {
    const host = document.createElement("div");
    createTableSurface(host, () => {}).update([note("/notes/sub/a.md")], "/notes");
    const cells = Array.from(host.querySelectorAll("tbody td")).map(td => td.textContent);
    expect(cells).toContain("sub/a.md"); expect(cells).not.toContain("/notes/sub/a.md");
  });
});

describe("editable table", () => {
  it("edits a cell and rejects invalid numbers", async () => {
    const host = document.createElement("div"), edits: unknown[] = [];
    const surface = createTableSurface(host, { open: () => {}, folderKeys: () => [], edit: async (n, e) => { edits.push([n, e]); return { changed: [], skipped: [] }; } });
    surface.update([note("/notes/a.md", { count: 1 })], "/notes");
    const cell = host.querySelectorAll("tbody td")[4] as HTMLElement;
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = cell.querySelector("input")!; input.value = "bad"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(cell.textContent).toContain("Enter a number."); expect(edits).toHaveLength(0);
    input.value = "2"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve(); expect(edits).toHaveLength(1);
  });
  it("selects rows and hides and restores columns", () => {
    const host = document.createElement("div"); const surface = createTableSurface(host, () => {});
    surface.update([note("/notes/a.md", { x: 1 })], "/notes");
    host.querySelector<HTMLInputElement>('input[aria-label="Select row"]')!.click(); expect(host.textContent).toContain("1 selected");
    host.querySelector<HTMLButtonElement>('button[aria-label="Column menu: x"]')!.click();
    Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Hide column")!.click();
    expect(host.textContent).toContain("Hidden (1)");
    Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Hidden (1)")!.click();
    Array.from(host.querySelectorAll("button")).find(b => b.textContent === "x")!.click();
    expect(host.querySelector('button[aria-label="Column menu: x"]')).not.toBeNull();
  });
  it("shows checkbox columns as checkboxes and toggles on click", async () => {
    const host = document.createElement("div"), edits: unknown[] = [];
    const surface = createTableSurface(host, { open: () => {}, folderKeys: () => [], edit: async (_n, e) => { edits.push(e); return { changed: [], skipped: [] }; } });
    surface.update([note("/notes/a.md", { done: true }), note("/notes/b.md", {})], "/notes");
    const boxes = host.querySelectorAll<HTMLInputElement>("input.table-check");
    expect(boxes).toHaveLength(2); expect(boxes[0].checked).toBe(true); expect(boxes[1].checked).toBe(false);
    (boxes[1].closest("td") as HTMLElement).click(); await Promise.resolve();
    expect(edits).toEqual([{ key: "done", value: true }]);
  });
  it("highlights picked rows and clears the selection after a bulk apply", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const surface = createTableSurface(host, { open: () => {}, folderKeys: () => ["x"], edit: async notes => ({ changed: notes.map(n => n.path), skipped: [] }) });
    surface.update([note("/notes/a.md", { x: "old" }), note("/notes/b.md", { x: "old" })], "/notes");
    host.querySelector<HTMLInputElement>('input[aria-label="Select row"]')!.click();
    expect(host.querySelectorAll("tr.table-picked")).toHaveLength(1);
    Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Set property…")!.click();
    document.querySelector<HTMLInputElement>('input[aria-label="Property"]')!.value = "x";
    document.querySelector<HTMLInputElement>('input[aria-label="Value"]')!.value = "new";
    Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Review…")!.click();
    Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Apply to 1 note")!.click();
    await new Promise(r => setTimeout(r, 0));
    expect(host.querySelectorAll("tr.table-picked")).toHaveLength(0); expect(host.textContent).toContain("2 matching notes");
    expect(document.querySelector(".app-toast")?.textContent).toBe("Updated 1 note"); host.remove();
  });
});
