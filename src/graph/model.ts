import { resolveLink } from "../links/resolve";

export type GraphSnapshot = { folder: string; notes: { path: string; title: string; links: string[] }[] };
export type GraphNode = { id: string; path: string; title: string; missing: boolean; incoming: number; outgoing: number };
export type GraphEdge = { source: string; target: string; missing: boolean };
export type GraphData = { folder: string; nodes: GraphNode[]; edges: GraphEdge[] };
export type GraphOptions = { mode: "local" | "folder"; center: string | null; depth: 1 | 2; folder: string; orphans: boolean };
export type GraphSelection = GraphData & { total: number; noteCount: number; missingCount: number; notice: string };

// Index paths are canonicalized by the native scanner. Reject noncanonical input here too.
export function graphPathInside(path: string, folder: string): boolean {
  const root = folder.replace(/\/$/, "");
  return path.startsWith(`${root}/`) && !path.includes("\\") && !/[\u0000-\u001f]/.test(path) &&
    !path.split("/").some(p => p === "." || p === "..");
}

export function buildGraph(snapshot: GraphSnapshot): GraphData {
  const nodes = new Map<string, GraphNode>();
  for (const note of snapshot.notes) {
    if (graphPathInside(note.path, snapshot.folder)) nodes.set(note.path, { id: note.path, path: note.path, title: note.title, missing: false, incoming: 0, outgoing: 0 });
  }
  const edges: GraphEdge[] = [];
  for (const note of snapshot.notes) {
    const source = nodes.get(note.path);
    if (!source || source.missing) continue;
    for (const link of note.links) {
      const resolved = resolveLink(link, note.path, snapshot.folder);
      if (resolved.kind !== "note" || !resolved.path || !graphPathInside(resolved.path, snapshot.folder)) continue;
      let target = nodes.get(resolved.path);
      if (!target) {
        target = { id: resolved.path, path: resolved.path, title: "missing", missing: true, incoming: 0, outgoing: 0 };
        nodes.set(target.id, target);
      }
      source.outgoing++; target.incoming++;
      edges.push({ source: source.id, target: target.id, missing: target.missing });
    }
  }
  return { folder: snapshot.folder, nodes: [...nodes.values()], edges };
}

export function selectGraph(graph: GraphData, options: GraphOptions): GraphSelection {
  const filter = options.folder.replace(/\/$/, "");
  const validFilter = !filter.startsWith("/") && !filter.includes("\\") && !filter.split("/").some(p => p === ".." || p === ".");
  const prefix = `${graph.folder.replace(/\/$/, "")}/${filter}${filter ? "/" : ""}`;
  let candidates = graph.nodes.filter(n => !n.missing && validFilter && n.path.startsWith(prefix));
  if (options.mode === "local") {
    const reached = new Set(options.center ? [options.center] : []);
    for (let depth = 0; depth < options.depth; depth++) {
      const previous = new Set(reached);
      for (const edge of graph.edges) {
        if (previous.has(edge.source)) reached.add(edge.target);
        if (previous.has(edge.target)) reached.add(edge.source);
      }
    }
    candidates = candidates.filter(n => reached.has(n.id));
  }
  if (!options.orphans) candidates = candidates.filter(n => n.incoming + n.outgoing > 0 || (options.mode === "local" && n.id === options.center));
  candidates.sort((a, b) => (b.incoming + b.outgoing) - (a.incoming + a.outgoing) || a.path.localeCompare(b.path));
  const total = candidates.length;
  const notes = options.mode === "folder" ? candidates.slice(0, 500) : candidates;
  const ids = new Set(notes.map(n => n.id));
  const missingIds = new Set(graph.edges.filter(e => e.missing && ids.has(e.source)).map(e => e.target));
  const missing = graph.nodes.filter(n => n.missing && missingIds.has(n.id));
  const edges = graph.edges.filter(e => ids.has(e.source) && (ids.has(e.target) || missingIds.has(e.target)));
  return { folder: graph.folder, nodes: [...notes, ...missing], edges, total, noteCount: notes.length, missingCount: missing.length,
    notice: total > notes.length ? `Showing 500 of ${total.toLocaleString("en-US")} notes. Filter by folder to see more.` : "" };
}
