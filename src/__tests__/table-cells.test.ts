import { describe, expect, it } from "vitest";
import { columnKind, editableCell, parseCellInput, validColumnKey } from "../table-view/cells";
import type { IndexedNote } from "../links/index";

const note = (properties: Record<string, unknown>, propertyError = false) => ({ properties, propertyError }) as unknown as IndexedNote;
describe("table cells", () => {
  it("chooses the first nonempty kind and checks editability", () => {
    expect(columnKind([note({ a: "" }), note({ a: 2 })], "a")).toBe("number");
    expect(columnKind([], "a")).toBe("text");
    expect(editableCell(note({}), { label: "Title", base: "title" })).toBe(false);
    expect(editableCell(note({}, true), { label: "a", key: "a" })).toBe(false);
    expect(editableCell(note({ a: {} }), { label: "a", key: "a" })).toBe(false);
    expect(editableCell(note({ a: ["a", 1] }), { label: "a", key: "a" })).toBe(false);
    expect(editableCell(note({ a: ["a"] }), { label: "a", key: "a" })).toBe(true);
  });
  it("validates input and removes empty values", () => {
    expect(parseCellInput("text", "")).toEqual({ ok: true, value: undefined });
    expect(parseCellInput("number", " 2 ")).toEqual({ ok: true, value: 2 });
    expect(parseCellInput("number", "abc")).toEqual({ ok: false, message: "Enter a number." });
    expect(parseCellInput("date", "2026-02-30").ok).toBe(false);
    expect(parseCellInput("date", "2026-02-28").ok).toBe(true);
    expect(parseCellInput("checkbox", true)).toEqual({ ok: true, value: true });
    expect(parseCellInput("list", [" a ", "a", "", "b"])).toEqual({ ok: true, value: ["a", "b"] });
    expect(parseCellInput("list", [])).toEqual({ ok: true, value: undefined });
    expect(validColumnKey("bad\nkey")).toBe(false);
  });
});
