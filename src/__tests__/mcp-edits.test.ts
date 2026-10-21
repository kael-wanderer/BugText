import { describe, expect, it } from "vitest";
import { applyEdits, checkRevision } from "../mcp/edits";
import { hashText } from "../hash";

describe("applyEdits", () => {
  it("replaces one exact match", () => {
    expect(applyEdits("one two", [{ old: "two", new: "three" }])).toMatchObject({ ok: true, text: "one three" });
  });

  it("applies edits in order against each previous result", () => {
    expect(applyEdits("alpha beta", [
      { old: "alpha", new: "gamma" },
      { old: "gamma beta", new: "done" },
    ])).toMatchObject({ ok: true, text: "done" });
  });

  it("reports missing text with the edit index", () => {
    expect(applyEdits("first", [
      { old: "first", new: "second" },
      { old: "absent", new: "x" },
    ])).toEqual({ ok: false, error: "Edit 2: text not found." });
  });

  it("rejects ambiguous matches", () => {
    expect(applyEdits("cat cat", [{ old: "cat", new: "dog" }])).toEqual({
      ok: false,
      error: "Edit 1: text found 2 times; add more context.",
    });
  });

  it("rejects empty old text", () => {
    expect(applyEdits("text", [{ old: "", new: "x" }])).toEqual({
      ok: false,
      error: "Edit 1: old text is empty.",
    });
  });

  it("returns original-coordinate changes that apply to the result", () => {
    const original = "abcdef";
    const result = applyEdits(original, [
      { old: "b", new: "B" },
      { old: "e", new: "E" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let rebuilt = original;
    for (const change of [...result.changes].sort((a, b) => b.from - a.from))
      rebuilt = rebuilt.slice(0, change.from) + change.insert + rebuilt.slice(change.to);
    expect(rebuilt).toBe(result.text);
    expect(result.changes).toEqual([
      { from: 1, to: 2, insert: "B" },
      { from: 4, to: 5, insert: "E" },
    ]);
  });

  it("collapses overlapping sequential edits to an original-text change", () => {
    const original = "abcdef";
    const result = applyEdits(original, [
      { old: "b", new: "XX" },
      { old: "XXc", new: "Z" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([{ from: 1, to: 3, insert: "Z" }]);
    const change = result.changes[0];
    expect(original.slice(0, change.from) + change.insert + original.slice(change.to)).toBe(result.text);
  });
});

describe("checkRevision", () => {
  it("accepts a matching revision", () => {
    expect(checkRevision("hello", hashText("hello"))).toBeNull();
  });
  it("rejects a mismatching or missing revision", () => {
    expect(checkRevision("hello", "wrong")).toBe("The note changed since you read it. Read it again.");
    expect(checkRevision("hello", undefined)).toBe("The note changed since you read it. Read it again.");
  });
});
