import { describe, expect, it } from "vitest";
import { loadProperties } from "../properties/loader";
import { supersedeChange } from "../lifecycle/supersede";

const { setProperty, readProperties } = await loadProperties();
const apply = (source: string, change: { from: number; to: number; insert: string }) => source.slice(0, change.from) + change.insert + source.slice(change.to);

describe("supersedeChange", () => {
  it("adds both properties to a note without front matter as one change", () => {
    const change = supersedeChange("# A\n\nBody\n", "b.md", setProperty)!;
    const next = apply("# A\n\nBody\n", change);
    expect(readProperties(next)).toEqual({ ok: true, props: { status: "superseded", superseded_by: "b.md" } });
    expect(next.endsWith("# A\n\nBody\n")).toBe(true);
  });
  it("replaces an existing status and keeps other properties", () => {
    const source = "---\nstatus: draft\ntags: [a]\n---\nBody\n";
    const next = apply(source, supersedeChange(source, "docs/b.md", setProperty)!);
    expect(readProperties(next)).toEqual({ ok: true, props: { status: "superseded", tags: ["a"], superseded_by: "docs/b.md" } });
  });
  it("equals the two edits applied in turn", () => {
    const source = "---\ntitle: x\n---\nBody\n";
    const first = setProperty(source, "status", "superseded")!;
    const mid = apply(source, first);
    const two = apply(mid, setProperty(mid, "superseded_by", "b.md")!);
    expect(apply(source, supersedeChange(source, "b.md", setProperty)!)).toBe(two);
  });
  it("refuses invalid YAML", () => {
    expect(supersedeChange("---\nx: [\n---\nBody", "b.md", setProperty)).toBeNull();
  });
});
