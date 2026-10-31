// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLinkIndex, parseNote } from "../links/index";
import { buildGraph, type GraphSnapshot } from "../graph/model";
import { layoutGraph } from "../graph/layout";
import { createGraphView } from "../graph/view";

class TestWorker {
  static all: TestWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  snapshot!: GraphSnapshot;
  terminated = false;
  constructor() { TestWorker.all.push(this); }
  postMessage(snapshot: GraphSnapshot) { this.snapshot = snapshot; }
  terminate() { this.terminated = true; }
  finish() {
    const graph = buildGraph(this.snapshot);
    this.onmessage?.({ data: { graph, ...layoutGraph(graph) } } as MessageEvent);
  }
}
const cleanups: (() => void)[] = [];
beforeEach(() => { TestWorker.all = []; vi.stubGlobal("Worker", TestWorker); });
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
async function mount(notes: [string, string][], center: string | null = null) {
  const scan = vi.fn(async () => ({ notes: notes.map(([path, text]) => parseNote(path, text)), skipped: [] }));
  const index = createLinkIndex(scan);
  await index.ensure("/notes");
  const host = document.createElement("div"); document.body.append(host);
  const open = vi.fn(), newNote = vi.fn(), openFolder = vi.fn();
  const view = createGraphView(host, index, { center, open, newNote, openFolder });
  cleanups.push(view.destroy);
  return { host, index, scan, view, open, newNote, openFolder };
}
const latest = () => TestWorker.all[TestWorker.all.length - 1];
const click = (host: HTMLElement, label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();

it("renders every indexed note and edge in the 50-note fixture, after the Worker finishes", async () => {
  const { host } = await mount(Array.from({ length: 50 }, (_, i) => [`/notes/${i}.md`, i ? `[previous](${i - 1}.md)` : ""]));
  expect(host.textContent).toContain("Laying out…");
  expect(host.querySelector("svg")).toBeNull();
  latest().finish();
  expect(host.querySelectorAll(".graph-note")).toHaveLength(50);
  expect(host.querySelectorAll(".graph-edge")).toHaveLength(49);
  expect(host.textContent).toContain("50 nodes · 49 links · 0 missing targets");
});
it("renders the cap notice and no more than 500 real nodes", async () => {
  const { host } = await mount(Array.from({ length: 1240 }, (_, i) => [`/notes/${i}.md`, ""]));
  latest().finish();
  expect(host.querySelectorAll(".graph-note")).toHaveLength(500);
  expect(host.textContent).toContain("Showing 500 of 1,240 notes. Filter by folder to see more.");
});
it("renders markup-like titles, filenames, and folder names only as text", async () => {
  const { host, open } = await mount([["/notes/<svg onload=alert(1)>.md", ""], ["/notes/<img onerror=evil()>/a.md", "# <script>alert(1)</script>"]]);
  latest().finish();
  expect(host.querySelector("script, img, [onload], [onerror]")).toBeNull();
  expect([...host.querySelectorAll("svg text")].map(n => n.textContent)).toContain("<svg onload=alert(1)>");
  expect(host.querySelector("select[aria-label='Folder']")?.textContent).toContain("<img onerror=evil()>");
  host.querySelector(".graph-note")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(open).toHaveBeenCalledTimes(1);
});
it("draws a dashed missing target without note navigation or keyboard focus", async () => {
  const { host, open } = await mount([["/notes/a.md", "[missing](lost.md)"]]); latest().finish();
  expect(host.querySelectorAll(".graph-edge.missing")).toHaveLength(1);
  const missing = host.querySelector(".graph-missing")!;
  expect(missing.getAttribute("tabindex")).toBeNull();
  missing.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  missing.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(open).not.toHaveBeenCalled();
  expect(host.textContent).toContain("1 missing target");
});
it("offers an actionable empty state instead of an empty canvas", async () => {
  const { host, newNote } = await mount([]); latest().finish();
  expect(host.querySelector("svg")).toBeNull();
  expect(host.textContent).toContain("No notes in this folder");
  click(host, "Create note"); expect(newNote).toHaveBeenCalledOnce();
});
it("defaults local to depth 1, supports depth 2 and recenters without another Worker", async () => {
  const { host, view } = await mount([["/notes/a.md", "[b](b.md)"], ["/notes/b.md", "[c](c.md)"], ["/notes/c.md", ""]], "/notes/a.md");
  latest().finish();
  const depth = host.querySelector<HTMLSelectElement>('[aria-label="Depth"]')!;
  expect(depth.value).toBe("1"); expect(host.querySelectorAll(".graph-note")).toHaveLength(2);
  depth.value = "2"; depth.dispatchEvent(new Event("change"));
  expect(host.querySelectorAll(".graph-note")).toHaveLength(3);
  depth.value = "1"; depth.dispatchEvent(new Event("change"));
  view.setCenter("/notes/b.md");
  expect(host.querySelectorAll(".graph-note")).toHaveLength(3);
  expect(host.querySelector(".graph-note.center")?.getAttribute("aria-label")).toContain("b");
  expect(TestWorker.all).toHaveLength(1);
});
it("supports hover details, link-count tab order, Enter, Shift-click, pan, zoom and reset", async () => {
  const { host, open } = await mount([["/notes/a.md", "[b](b.md)"], ["/notes/b.md", "[c](c.md)"], ["/notes/c.md", ""]]); latest().finish();
  const nodes = host.querySelectorAll<SVGGElement>(".graph-note");
  expect(nodes[0].getAttribute("aria-label")).toContain("b");
  expect(nodes[0].getAttribute("tabindex")).toBe("0");
  expect(nodes[0].querySelector("title")?.textContent).toContain("1 in-link · 1 out-link");
  nodes[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(open).toHaveBeenLastCalledWith("/notes/b.md", false);
  nodes[0].dispatchEvent(new MouseEvent("click", { shiftKey: true, bubbles: true }));
  expect(open).toHaveBeenLastCalledWith("/notes/b.md", true);
  const svg = host.querySelector("svg")!, original = svg.getAttribute("viewBox");
  nodes[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  expect(svg.getAttribute("viewBox")).not.toBe(original);
  click(host, "Reset"); expect(svg.getAttribute("viewBox")).toBe(original);
  click(host, "Zoom in"); expect(svg.getAttribute("viewBox")).not.toBe(original);
  click(host, "Reset"); expect(svg.getAttribute("viewBox")).toBe(original);
});
it("filters by folder and toggles orphans without running layout again", async () => {
  const { host } = await mount([["/notes/project/a.md", "[b](b.md)"], ["/notes/project/b.md", ""], ["/notes/project/orphan.md", ""], ["/notes/else/c.md", ""]]); latest().finish();
  const folder = host.querySelector<HTMLSelectElement>('[aria-label="Folder"]')!;
  folder.value = "project"; folder.dispatchEvent(new Event("change"));
  expect(host.querySelectorAll(".graph-note")).toHaveLength(3);
  click(host, "Toggle orphans"); expect(host.querySelectorAll(".graph-note")).toHaveLength(2);
  expect(TestWorker.all).toHaveLength(1);
});
it("rebuilds on refresh, drops stale Worker results and terminates on destroy", async () => {
  const { host, index, view } = await mount([["/notes/a.md", ""]]); const first = latest();
  index.onFileChanged("/notes/b.md", ""); const second = latest();
  expect(first.terminated).toBe(true); first.finish();
  expect(host.querySelector("svg")).toBeNull(); second.finish();
  expect(host.querySelectorAll(".graph-note")).toHaveLength(2);
  view.destroy(); expect(second.terminated).toBe(true);
  const count = TestWorker.all.length; index.onFileChanged("/notes/c.md", "");
  expect(TestWorker.all).toHaveLength(count);
});
it("clears the old folder immediately and never navigates its stale nodes", async () => {
  const { host, index, open } = await mount([["/notes/a.md", ""]]); latest().finish();
  const old = host.querySelector(".graph-note")!;
  index.setFolder(null);
  expect(host.querySelector("svg")).toBeNull(); expect(host.textContent).toContain("Open a folder");
  old.dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(open).not.toHaveBeenCalled();
});
it("shows only a generic retryable error when layout fails", async () => {
  const { host } = await mount([["/notes/a.md", ""]]);
  latest().onerror?.(new ErrorEvent("error", { message: "secret-path stack trace" }));
  expect(host.textContent).toContain("Could not lay out graph.");
  expect(host.textContent).not.toContain("secret-path");
  click(host, "Try again"); latest().finish();
  expect(host.querySelectorAll(".graph-note")).toHaveLength(1);
});

it("keeps the layout when edits leave the graph snapshot unchanged", async () => {
  const { index, host } = await mount([["/notes/a.md", "# A\n[b](b.md)"], ["/notes/b.md", "# B"]]);
  latest().finish();
  index.onFileChanged("/notes/a.md", "# A\n[b](b.md)\nExtra text");
  expect(TestWorker.all).toHaveLength(1); expect(host.textContent).not.toContain("Laying out…");
  index.onFileChanged("/notes/a.md", "# A\n[c](c.md)");
  expect(TestWorker.all).toHaveLength(2);
});
