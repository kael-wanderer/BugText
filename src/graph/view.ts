import type { LinkIndex } from "../links/index";
import { graphPathInside, selectGraph, type GraphData, type GraphOptions, type GraphSnapshot } from "./model";
import type { GraphLayout } from "./layout";
import { drawGraph } from "./scene";
import "./graph.css";

export type GraphViewOptions = {
  center: string | null;
  mode?: "local" | "folder";
  open(path: string, newTab: boolean): void;
  newNote(): void;
  openFolder(): void;
};
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text: string, label: string, action: () => void): HTMLButtonElement {
  const node = element("button", text); node.type = "button"; node.setAttribute("aria-label", label); node.onclick = action; return node;
}
function select(label: string, values: [string, string][]): HTMLSelectElement {
  const node = element("select"); node.setAttribute("aria-label", label);
  for (const [value, text] of values) { const option = element("option", text); option.value = value; node.append(option); }
  return node;
}
export function createGraphView(host: HTMLElement, index: LinkIndex, config: GraphViewOptions) {
  const options: GraphOptions = { mode: config.mode ?? (config.center ? "local" : "folder"), center: config.center, depth: 1, folder: "", orphans: (config.mode ?? (config.center ? "local" : "folder")) === "folder" };
  let disposed = false, generation = 0, worker: Worker | null = null;
  let result: (GraphLayout & { graph: GraphData }) | null = null;
  let scene: ReturnType<typeof drawGraph> | null = null;
  let currentFolder = index.folder;
  let laidOutKey: string | null = null;
  const root = element("section", undefined, "graph-view"); root.setAttribute("aria-label", "Graph view");
  const bar = element("div", undefined, "graph-bar"), heading = element("strong", "Graph");
  const mode = select("Graph mode", [["local", "Local"], ["folder", "Folder"]]); mode.value = options.mode;
  const depth = select("Depth", [["1", "Depth 1"], ["2", "Depth 2"]]);
  const folder = select("Folder", [["", "All notes"]]);
  const spacer = element("span", undefined, "graph-spacer");
  const orphans = button("", "Toggle orphans", () => { options.orphans = !options.orphans; render(); });
  bar.append(heading, mode, depth, folder, spacer, orphans,
    button("−", "Zoom out", () => scene?.zoom(-0.2)), button("+", "Zoom in", () => scene?.zoom(0.2)), button("Reset", "Reset", () => scene?.reset()));
  const body = element("div", undefined, "graph-body"), footer = element("div", undefined, "graph-foot"); footer.setAttribute("role", "status");
  root.append(bar, body, footer); host.append(root);
  mode.onchange = () => { options.mode = mode.value === "folder" ? "folder" : "local"; render(); };
  depth.onchange = () => { options.depth = depth.value === "2" ? 2 : 1; render(); };
  folder.onchange = () => { options.folder = folder.value; render(); };
  function state(title: string, explanation = "", action?: [string, () => void]) {
    scene = null; body.replaceChildren();
    const empty = element("div", undefined, "graph-empty"); empty.setAttribute("role", "status");
    empty.append(element("strong", title));
    if (explanation) empty.append(element("p", explanation));
    if (action) empty.append(button(action[0], action[0], action[1]));
    body.append(empty); footer.textContent = "";
  }
  function render() {
    if (disposed || !result) return;
    depth.hidden = options.mode !== "local";
    mode.value = options.mode;
    orphans.textContent = `Orphans ${options.orphans ? "on" : "off"}`; orphans.setAttribute("aria-pressed", String(options.orphans));
    const selected = selectGraph(result.graph, options);
    if (!result.graph.nodes.some(n => !n.missing)) {
      state("No notes in this folder", "Create a Markdown note to start connecting your ideas.", ["Create note", config.newNote]); return;
    }
    if (options.mode === "local" && !result.graph.nodes.some(n => !n.missing && n.id === options.center)) {
      state("Open a Markdown note to see its local graph", "Or explore all the notes in this folder.", ["Show folder graph", () => { options.mode = "folder"; options.orphans = true; render(); }]); return;
    }
    if (!selected.noteCount) {
      state("No notes match this view", "Try another folder or include orphan notes.", ["Clear filters", () => { options.folder = ""; folder.value = ""; options.orphans = true; render(); }]); return;
    }
    const renderedGeneration = generation;
    scene = drawGraph(body, selected, result.positions, options.mode === "local" ? options.center : null, (path, newTab) => {
      if (disposed || renderedGeneration !== generation || index.folder !== result?.graph.folder || !index.get(path) || !graphPathInside(path, index.folder)) return;
      config.open(path, newTab);
    });
    const links = selected.edges.filter(e => !e.missing).length;
    footer.textContent = selected.notice || `${selected.noteCount} nodes · ${links} links · ${selected.missingCount} missing target${selected.missingCount === 1 ? "" : "s"}`;
  }
  function fail() { state("Could not lay out graph.", "", ["Try again", rebuild]); }
  function rebuild() {
    if (disposed) return;
    const snapshot: GraphSnapshot | null = index.folder && index.ready ? { folder: index.folder, notes: index.notes().sort((a, b) => a.path.localeCompare(b.path)).map(note => ({ path: note.path, title: note.headings[0]?.text || note.path.split("/").pop()!.replace(/\.(md|markdown)$/i, ""), links: note.links.map(link => link.target) })) } : null;
    const snapshotKey = snapshot ? snapshot.folder + "\n" + snapshot.notes.map(note => note.path + "\t" + note.title + "\t" + note.links.join("\t")).join("\n") : null;
    if (result && snapshotKey === laidOutKey) return;
    const token = ++generation;
    worker?.terminate(); worker = null; result = null;
    if (currentFolder !== index.folder) { currentFolder = index.folder; options.folder = ""; folder.value = ""; }
    if (!index.folder) { state("Open a folder to see its graph", "The graph connects Markdown notes in your open folder.", ["Open folder", config.openFolder]); return; }
    if (!index.ready) {
      state("Indexing notes…");
      void index.ensure().catch(() => { if (!disposed && token === generation) state("Could not index notes.", "", ["Try again", rebuild]); }); return;
    }
    state("Laying out…");
    if (!snapshot) return;
    try {
      worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = event => {
        if (disposed || token !== generation) return;
        if (event.data.error) { fail(); return; }
        result = event.data;
        laidOutKey = snapshotKey;
        const folders = new Set<string>();
        for (const note of result!.graph.nodes) {
          if (note.missing) continue;
          const parts = note.path.slice(snapshot.folder.replace(/\/$/, "").length + 1).split("/"); parts.pop();
          while (parts.length) { folders.add(parts.join("/")); parts.pop(); }
        }
        folder.replaceChildren();
        for (const path of ["", ...[...folders].sort()]) { const option = element("option", path ? `${path}/` : "All notes"); option.value = path; folder.append(option); }
        folder.value = options.folder;
        render();
      };
      worker.onerror = event => { event.preventDefault(); if (!disposed && token === generation) fail(); };
      worker.postMessage(snapshot);
    } catch { fail(); }
  }
  const unsubscribe = index.subscribe(rebuild);
  rebuild();
  return {
    setCenter(path: string | null) { if (options.center !== path) { options.center = path; render(); } },
    setMode(next: "local" | "folder") { options.mode = next; render(); },
    zoom(delta: number) { scene?.zoom(delta); },
    reset() { scene?.reset(); },
    destroy() { if (disposed) return; disposed = true; generation++; worker?.terminate(); unsubscribe(); root.remove(); },
  };
}
