import { loadProperties } from "../properties/loader";
await loadProperties();
import { describe, expect, it } from "vitest";
import { parseNote } from "../links/index";
import { completionDate } from "../tasks";
import { resolveInputs, SOURCE_LIMIT, type InputContext } from "../recipes/inputs";
import type { Recipe, RecipeInput } from "../ai/actions-store";
import type { SavedView } from "../saved-views/model";

const now = new Date(2026, 10, 12, 10);
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9).getTime();
const files: Record<string, string> = {
  "/r/a.md": "alpha",
  "/r/research/x.md": "---\ntags: [research]\n---\nx",
  "/r/research/deep/y.md": "y",
  "/r/old.md": "---\nstatus: superseded\n---\nold\n- [x] stale ✅ 2026-11-11",
  "/r/secret.md": "secret\n- [x] hidden ✅ 2026-11-11",
  "/r/tasks.md": "- [x] ship ✅ 2026-11-10\n- [x] old ✅ 2026-10-01\n- [ ] open",
};
function ctx(over: Partial<InputContext> = {}, extra: Record<string, string> = {}): InputContext {
  const all = { ...files, ...extra };
  const notes = Object.entries(all).map(([path, text]) => parseNote(path, text));
  return {
    folder: "/r", current: null, notes, views: [], recipeName: "Weekly review", output: null,
    textOf: path => all[path] ?? null,
    modifiedMs: () => null,
    isExcluded: path => path === "/r/secret.md",
    includeSuperseded: false, now,
    ...over,
  };
}
const recipe = (...inputs: RecipeInput[]): Recipe => ({ inputs, output: { kind: "chat" } });
const paths = (r: ReturnType<typeof resolveInputs>) => r.sources.map(s => s.path);

describe("resolveInputs", () => {
  it("uses the tab text for the current note", () => {
    const r = resolveInputs(recipe({ kind: "current-note" }), ctx({ current: "/r/a.md", textOf: () => "unsaved" }));
    expect(r.sources).toEqual([{ path: "/r/a.md", label: "a.md", text: "unsaved" }]);
  });

  it("needs an open note for the current note", () => {
    expect(resolveInputs(recipe({ kind: "current-note" }), ctx()).error).toBe("Open a note to run this recipe.");
  });

  it("matches a glob under a folder in path order", () => {
    expect(paths(resolveInputs(recipe({ kind: "glob", folder: "research", glob: "**/*.md" }), ctx()))).toEqual(["/r/research/deep/y.md", "/r/research/x.md"]);
  });

  it("matches a basename glob at any depth", () => {
    expect(paths(resolveInputs(recipe({ kind: "glob", folder: "research", glob: "*.md" }), ctx()))).toEqual(["/r/research/deep/y.md", "/r/research/x.md"]);
  });

  it("takes notes changed in the last N days, newest first", () => {
    const times: Record<string, number> = { "/r/a.md": at(2026, 11, 10), "/r/research/x.md": at(2026, 10, 1), "/r/tasks.md": at(2026, 11, 12) };
    const r = resolveInputs(recipe({ kind: "changed", days: 7 }), ctx({ modifiedMs: p => times[p] ?? null }));
    expect(paths(r)).toEqual(["/r/tasks.md", "/r/a.md"]);
  });

  it("resolves a saved view and refuses an unknown or foreign one", () => {
    const view: SavedView = { id: "v1", name: "Research", folder: "/r", filter: { mode: "all", folder: null, tags: [{ key: "research", exclude: false }], rows: [] }, sort: "path", descending: false };
    expect(paths(resolveInputs(recipe({ kind: "view", viewId: "v1" }), ctx({ views: [view] })))).toEqual(["/r/research/x.md"]);
    const gone = "The saved view for this recipe no longer exists.";
    expect(resolveInputs(recipe({ kind: "view", viewId: "nope" }), ctx({ views: [view] })).error).toBe(gone);
    expect(resolveInputs(recipe({ kind: "view", viewId: "v1" }), ctx({ views: [{ ...view, folder: "/other" }] })).error).toBe(gone);
  });

  it("lists a missing file as left out", () => {
    const r = resolveInputs(recipe({ kind: "files", paths: ["a.md", "gone.md"] }), ctx());
    expect(paths(r)).toEqual(["/r/a.md"]);
    expect(r.leftOut).toEqual([{ path: "/r/gone.md", reason: "missing" }]);
  });

  it("merges inputs without duplicates", () => {
    const r = resolveInputs(recipe({ kind: "current-note" }, { kind: "glob", folder: "", glob: "a.md" }), ctx({ current: "/r/a.md" }));
    expect(paths(r)).toEqual(["/r/a.md"]);
  });

  it("leaves out superseded and excluded notes", () => {
    const input = recipe({ kind: "files", paths: ["old.md", "secret.md"] });
    const r = resolveInputs(input, ctx());
    expect(r.sources).toEqual([]);
    expect(r.leftOut).toEqual([{ path: "/r/old.md", reason: "superseded" }, { path: "/r/secret.md", reason: "excluded" }]);
    const on = resolveInputs(input, ctx({ includeSuperseded: true }));
    expect(paths(on)).toEqual(["/r/old.md"]);
    expect(on.leftOut).toEqual([{ path: "/r/secret.md", reason: "excluded" }]);
  });

  it("leaves out an excluded current note", () => {
    const r = resolveInputs(recipe({ kind: "current-note" }), ctx({ current: "/r/secret.md" }));
    expect(r.sources).toEqual([]);
    expect(r.leftOut).toEqual([{ path: "/r/secret.md", reason: "excluded" }]);
  });

  it("collects completed tasks into one source", () => {
    const r = resolveInputs(recipe({ kind: "completed-tasks", days: 7 }), ctx());
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0].path).toBeNull();
    expect(r.sources[0].label).toBe("Completed tasks, last 7 days");
    expect(r.sources[0].text).toBe("- [x] ship ✅ 2026-11-10 — tasks.md");
  });

  it("applies the context rules to completed tasks", () => {
    const off = resolveInputs(recipe({ kind: "completed-tasks", days: 7 }), ctx()).sources[0].text;
    expect(off).not.toContain("hidden");
    expect(off).not.toContain("stale");
    const on = resolveInputs(recipe({ kind: "completed-tasks", days: 7 }), ctx({ includeSuperseded: true })).sources[0].text;
    expect(on).toContain("stale");
    expect(on).not.toContain("hidden");
  });

  it("never uses its own output as a source", () => {
    const extra = { "/r/Reviews/2026-W46.md": "---\ngenerated_by: Weekly review\n---\nlast", "/r/Reviews/other.md": "---\ngenerated_by: Weekly review\n---\nolder" };
    const times = (p: string) => p.startsWith("/r/Reviews/") ? at(2026, 11, 11) : null;
    const r = resolveInputs(recipe({ kind: "changed", days: 7 }), ctx({ output: "/r/Reviews/2026-W46.md", modifiedMs: times }, extra));
    expect(paths(r)).toEqual([]);
    expect(r.leftOut).toEqual([{ path: "/r/Reviews/other.md", reason: "generated" }]);
    const named = resolveInputs(recipe({ kind: "files", paths: ["Reviews/other.md"] }), ctx({}, extra));
    expect(paths(named)).toEqual(["/r/Reviews/other.md"]);
    const current = resolveInputs(recipe({ kind: "current-note" }), ctx({ current: "/r/Reviews/other.md" }, extra));
    expect(paths(current)).toEqual(["/r/Reviews/other.md"]);
    const glob = resolveInputs(recipe({ kind: "glob", folder: "Reviews", glob: "*.md" }), ctx({ recipeName: "Other recipe" }, extra));
    expect(paths(glob)).toEqual(["/r/Reviews/2026-W46.md", "/r/Reviews/other.md"]);
  });

  it(`keeps at most ${SOURCE_LIMIT} sources`, () => {
    const extra = Object.fromEntries(Array.from({ length: 205 }, (_, i) => [`/r/many/n${String(i).padStart(3, "0")}.md`, "n"]));
    const r = resolveInputs(recipe({ kind: "glob", folder: "many", glob: "*.md" }), ctx({}, extra));
    expect(r.sources).toHaveLength(200);
    expect(r.leftOut.filter(l => l.reason === "limit")).toHaveLength(5);
    expect(r.leftOut[0].path).toBe("/r/many/n200.md");
  });
});

describe("completionDate", () => {
  it("reads the ✅ stamp", () => {
    expect(completionDate("- [x] a ✅ 2026-11-10")).toBe("2026-11-10");
    expect(completionDate("- [x] a")).toBeNull();
  });
});
