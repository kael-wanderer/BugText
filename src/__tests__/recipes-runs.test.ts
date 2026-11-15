import { describe, expect, it } from "vitest";
import { changedSources, digests, parseRuns, recordRun, runKey } from "../recipes/runs";
import { hashText } from "../hash";

describe("recipe runs", () => {
  it("counts changed, new and gone sources", () => {
    expect(changedSources(undefined, { a: "1" })).toBe(1);
    const last = (sources: Record<string, string>) => ({ at: "2026-11-12T09:05", output: null, sources });
    expect(changedSources(last({ a: "1", b: "2" }), { a: "1", b: "3", c: "4" })).toBe(2);
    expect(changedSources(last({ a: "1", gone: "2" }), { a: "1" })).toBe(1);
    expect(changedSources(last({ a: "1" }), { a: "1" })).toBe(0);
  });

  it("reads a bad file as no runs", () => {
    expect(parseRuns("not json")).toEqual({});
    expect(parseRuns('{"version":1,"runs":[]}')).toEqual({});
    expect(parseRuns('{"version":1,"runs":{"k":{"at":"x","output":null,"sources":{}}}}')).toEqual({ k: { at: "x", output: null, sources: {} } });
  });

  it("keys by recipe and folder", () => {
    expect(runKey("r1", "/f")).toBe("r1\n/f");
  });

  it("digests note sources by relative path and skips the tasks source", () => {
    expect(digests([{ path: "/f/a.md", label: "a.md", text: "x" }, { path: null, label: "Completed tasks, last 7 days", text: "t" }], "/f"))
      .toEqual({ "a.md": hashText("x") });
  });

  it("keeps the other records in the file", async () => {
    let text = JSON.stringify({ version: 1, runs: { other: { at: "a", output: null, sources: {} } } });
    const io = { read: async () => text, write: async (next: string) => { text = next; } };
    await recordRun(io, "mine", { at: "b", output: "x.md", sources: { "a.md": "1" } });
    expect(parseRuns(text)).toEqual({ other: { at: "a", output: null, sources: {} }, mine: { at: "b", output: "x.md", sources: { "a.md": "1" } } });
    expect(JSON.parse(text).version).toBe(1);
  });
});
