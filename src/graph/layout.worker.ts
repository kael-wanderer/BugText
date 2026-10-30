import { buildGraph, type GraphSnapshot } from "./model";
import { layoutGraph } from "./layout";

self.onmessage = (event: MessageEvent<GraphSnapshot>) => {
  try {
    const graph = buildGraph(event.data);
    self.postMessage({ graph, ...layoutGraph(graph) });
  } catch {
    self.postMessage({ error: true });
  }
};
