import { describe, expect, it } from "vitest";
import { buildGraph, selectGraph, type GraphSnapshot } from "../graph/model";
import { layoutGraph } from "../graph/layout";

const options = { mode: "folder" as const, center: null, depth: 1 as const, folder: "", orphans: true };
const note = (name: string, links: string[] = []) => ({ path: `/notes/${name}.md`, title: name, links });
const snapshot = (notes: GraphSnapshot["notes"]): GraphSnapshot => ({ folder: "/notes", notes });

describe("graph selection from the note-link index", () => {
  it("includes each of 50 notes once and all 49 directed link occurrences", () => {
    const graph = buildGraph(snapshot(Array.from({ length: 50 }, (_, i) => note(String(i), i ? [`${i - 1}.md`] : []))));
    const selected = selectGraph(graph, options);
    expect(selected.nodes).toHaveLength(50);
    expect(new Set(selected.nodes.map(n => n.id)).size).toBe(50);
    expect(selected.edges).toHaveLength(49);
    expect(selected.noteCount).toBe(50);
    expect(selected.missingCount).toBe(0);
  });
  it("caps at the 500 most-linked notes and reports the original 1,240 count", () => {
    const graph = buildGraph(snapshot(Array.from({ length: 1240 }, (_, i) => note(String(i), i ? ["1239.md"] : []))));
    const selected = selectGraph(graph, options);
    expect(selected.nodes).toHaveLength(500);
    expect(selected.nodes[0].path).toBe("/notes/1239.md");
    expect(selected.notice).toBe("Showing 500 of 1,240 notes. Filter by folder to see more.");
    expect(selected.edges.every(e => selected.nodes.some(n => n.id === e.source) && selected.nodes.some(n => n.id === e.target))).toBe(true);
  });
  it("keeps missing targets separate, ignores web and escaping links, and counts duplicate links", () => {
    const graph = buildGraph(snapshot([note("a", ["b.md", "b.md", "lost.md", "https://example.com", "../outside.md", "%2e%2e/outside.md"]), note("b")]));
    const selected = selectGraph(graph, options);
    expect(selected.noteCount).toBe(2);
    expect(selected.missingCount).toBe(1);
    expect(selected.edges).toHaveLength(3);
    expect(selected.edges.filter(e => e.missing)).toHaveLength(1);
    expect(selected.nodes.find(n => n.path === "/notes/a.md")?.outgoing).toBe(3);
    expect(selected.nodes.find(n => n.path === "/notes/b.md")?.incoming).toBe(2);
  });
  it("includes both backlinks and links at depth 1, and allows depth 2", () => {
    const graph = buildGraph(snapshot([note("a", ["b.md"]), note("b", ["c.md"]), note("c"), note("d", ["a.md"]), note("orphan")]));
    const local = { ...options, mode: "local" as const, center: "/notes/a.md", orphans: false };
    expect(selectGraph(graph, local).nodes.map(n => n.title).sort()).toEqual(["a", "b", "d"]);
    expect(selectGraph(graph, { ...local, depth: 2 }).nodes.map(n => n.title).sort()).toEqual(["a", "b", "c", "d"]);
    expect(selectGraph(graph, { ...local, center: "/notes/orphan.md" }).noteCount).toBe(1);
  });
  it("filters a folder by path boundary before applying the cap and toggles orphans", () => {
    const graph = buildGraph(snapshot([note("project/a", ["b.md"]), note("project/b"), note("projects/c"), note("project/orphan")]));
    expect(selectGraph(graph, { ...options, folder: "project" }).noteCount).toBe(3);
    expect(selectGraph(graph, { ...options, folder: "project", orphans: false }).noteCount).toBe(2);
    expect(selectGraph(graph, { ...options, folder: "../" }).noteCount).toBe(0);
    expect(selectGraph(graph, { ...options, folder: "/outside" }).noteCount).toBe(0);
  });
  it("rejects index paths with traversal or outside the open folder", () => {
    const graph = buildGraph(snapshot([note("ok"), note("../outside"), { ...note("x"), path: "/notes-other/x.md" }]));
    expect(selectGraph(graph, options).nodes.map(n => n.title)).toEqual(["ok"]);
  });
  it("returns an empty selection for an empty folder", () => {
    expect(selectGraph(buildGraph(snapshot([])), options)).toMatchObject({ nodes: [], edges: [], noteCount: 0, missingCount: 0 });
  });
});

it("produces deterministic finite positions with a fixed 300-step layout budget", () => {
  const graph = buildGraph(snapshot([note("a", ["b.md", "lost.md"]), note("b"), note("orphan")]));
  const result = layoutGraph(graph);
  expect(result.steps).toBe(300);
  expect(result.positions).toHaveLength(4);
  expect(result.positions.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  expect(result).toEqual(layoutGraph(graph));
});
