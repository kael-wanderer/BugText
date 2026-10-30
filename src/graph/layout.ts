import type { GraphData } from "./model";
export type GraphPosition = { id: string; x: number; y: number };
export type GraphLayout = { positions: GraphPosition[]; steps: number };

/** Worker-only bounded force layout. Spatial buckets keep repulsion local. */
export function layoutGraph(graph: GraphData): GraphLayout {
  const positions = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)).map((n, i) => {
    const angle = i * 2.399963229728653;
    const radius = 36 * Math.sqrt(i + 1);
    return { id: n.id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  const byId = new Map(positions.map((p, i) => [p.id, i]));
  const edges = graph.edges.map(e => [byId.get(e.source)!, byId.get(e.target)!]);
  const dx = new Float64Array(positions.length), dy = new Float64Array(positions.length);
  for (let step = 0; step < 300; step++) {
    dx.fill(0); dy.fill(0);
    const cells = new Map<string, number[]>();
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i], key = `${Math.floor(p.x / 120)},${Math.floor(p.y / 120)}`;
      const bucket = cells.get(key) ?? []; bucket.push(i); cells.set(key, bucket);
    }
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i], cx = Math.floor(p.x / 120), cy = Math.floor(p.y / 120);
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
        for (const j of cells.get(`${x},${y}`) ?? []) {
          if (j <= i) continue;
          const vx = p.x - positions[j].x, vy = p.y - positions[j].y;
          const squared = Math.max(1, vx * vx + vy * vy);
          const force = 1000 / squared;
          dx[i] += vx * force; dy[i] += vy * force;
          dx[j] -= vx * force; dy[j] -= vy * force;
        }
      }
    }
    for (const [a, b] of edges) {
      const x = positions[b].x - positions[a].x, y = positions[b].y - positions[a].y;
      const distance = Math.max(1, Math.hypot(x, y));
      const force = (distance - 105) * 0.012 / distance;
      dx[a] += x * force; dy[a] += y * force; dx[b] -= x * force; dy[b] -= y * force;
    }
    const cooling = 1 - step / 300;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      p.x += Math.max(-12, Math.min(12, dx[i] - p.x * 0.002)) * cooling;
      p.y += Math.max(-12, Math.min(12, dy[i] - p.y * 0.002)) * cooling;
    }
  }
  return { positions, steps: 300 };
}
