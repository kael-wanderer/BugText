import { expect, it } from "vitest";
import { parseNote } from "../links/index";
import { filterNotes, matchNote, type FilterModel } from "../properties/filter-query";
import { operatorFilter, parseSearchOperators } from "../search-operators";
const notes = [parseNote("/r/a.md", "---\ntags: [Work/Sub]\nstatus: draft\ndate: 2026-10-10\n---\n"), parseNote("/r/b.md", "---\ntags: [other]\ndate: 2026-13-01\n---\n")];
const empty: FilterModel = { tags: [], rows: [], folder: null, mode: "all" };
it("agrees with tag operators, including ancestors", () => {
  const model: FilterModel = { ...empty, tags: [{ key: "work", exclude: false }] };
  expect(filterNotes(notes, model).map(n => n.path)).toEqual(notes.filter(n => operatorFilter(parseSearchOperators("tag:WORK"), n)).map(n => n.path));
});
it("handles invalid dates, all/any, exclusion, folder and is set", () => {
  expect(notes.filter(n => operatorFilter(parseSearchOperators("after:2026-10-01"), n)).map(n => n.path)).toEqual(["/r/a.md"]);
  const model: FilterModel = { ...empty, tags: [{ key: "work", exclude: true }], rows: [{ key: "status", op: "is set", value: "" }] };
  expect(filterNotes(notes, model)).toHaveLength(0);
  expect(filterNotes(notes, { ...model, mode: "any" })).toHaveLength(2);
  expect(matchNote(notes[0], { ...empty, folder: "/other" })).toBe(false);
});
