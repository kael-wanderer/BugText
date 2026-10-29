import { loadProperties } from "../properties/loader";
await loadProperties();
import { expect, it } from "vitest";
import { parseNote } from "../links/index";
import { operatorFilter, parseSearchOperators } from "../search-operators";
it("leaves unknown and invalid operators as plain text", () => {
  expect(parseSearchOperators("foo:bar after:2026-13-01 action").text).toBe("foo:bar after:2026-13-01 action");
  expect(parseSearchOperators("action items").text).toBe("action items");
});
it("matches indexed tags and properties without code tags", () => {
  const note = parseNote("/r/notes/a.md", "---\nstatus: Draft\n---\n#work\n```\n#hidden\n```\n");
  expect(operatorFilter(parseSearchOperators("tag:work prop:status=draft path:notes/"), note, "notes/a.md")).toBe(true);
  expect(operatorFilter(parseSearchOperators("tag:hidden"), note, "notes/a.md")).toBe(false);
  expect(operatorFilter(parseSearchOperators("path:other/"), note, "notes/a.md")).toBe(false);
});
