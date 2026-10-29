import { describe, expect, it } from "vitest";
import { findFrontMatter, propertyKind, readProperties } from "../properties/parse";

describe("properties parsing", () => {
  it("finds only closed leading blocks", () => {
    expect(findFrontMatter("plain")).toBeNull();
    expect(findFrontMatter("---\nx: 1")).toBeNull();
    expect(readProperties("---\nx: 1\n...\nbody")).toEqual({ ok: true, props: { x: 1 } });
  });
  it("rejects invalid, non-map, alias and unknown tagged YAML", () => {
    for (const block of ["a: [", "- a", "a: &a x\nb: *a", "a: !!js/function test"]) {
      expect(readProperties(`---\n${block}\n---\n`)).toMatchObject({ ok: false });
    }
  });
  it("classifies values", () => {
    expect([[], true, 1, "2026-10-29", "text"].map(propertyKind)).toEqual(["list", "checkbox", "number", "date", "text"]);
  });
});
