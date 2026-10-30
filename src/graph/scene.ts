import type { GraphSelection } from "./model";
import type { GraphPosition } from "./layout";

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export function drawGraph(host: HTMLElement, graph: GraphSelection, positions: GraphPosition[], center: string | null, open: (path: string, newTab: boolean) => void) {
  const points = new Map(positions.map(p => [p.id, p]));
  const canvas = svg("svg", { role: "group", "aria-label": "Note graph. Tab through notes; Enter to open; arrow keys to pan.", tabindex: "0" });
  const visible = graph.nodes.map(n => points.get(n.id)).filter((p): p is GraphPosition => !!p);
  const centerPoint = center ? points.get(center) : null;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const p of visible) { left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); bottom = Math.max(bottom, p.y); }
  const cx = centerPoint?.x ?? (left + right) / 2, cy = centerPoint?.y ?? (top + bottom) / 2;
  const width = Math.max(400, 2 * Math.max(cx - left, right - cx) + 260);
  const height = Math.max(320, 2 * Math.max(cy - top, bottom - cy) + 120);
  let x = cx, y = cy, zoom = 1;
  const update = () => canvas.setAttribute("viewBox", `${x - width / zoom / 2} ${y - height / zoom / 2} ${width / zoom} ${height / zoom}`);
  update();
  for (const edge of graph.edges) {
    const a = points.get(edge.source), b = points.get(edge.target);
    if (!a || !b) continue;
    canvas.append(svg("line", { class: `graph-edge${edge.missing ? " missing" : ""}`, x1: String(a.x), y1: String(a.y), x2: String(b.x), y2: String(b.y) }));
  }
  // The selection is ordered by link count; DOM order is also the natural Tab order.
  for (const node of graph.nodes) {
    const point = points.get(node.id);
    if (!point) continue;
    const group = svg("g", { class: `${node.missing ? "graph-missing" : "graph-note"}${node.id === center ? " center" : ""}${node.incoming + node.outgoing === 0 ? " orphan" : ""}`, transform: `translate(${point.x} ${point.y})` });
    const title = svg("title");
    title.textContent = `${node.title}\n${node.path}\n${node.incoming} in-link${node.incoming === 1 ? "" : "s"} · ${node.outgoing} out-link${node.outgoing === 1 ? "" : "s"}`;
    const radius = node.missing ? 6 : node.id === center ? 12 : Math.min(10, 5 + Math.sqrt(node.incoming + node.outgoing));
    const circle = svg("circle", { r: String(radius) });
    const text = svg("text", { x: String(radius + 6), y: "4", class: "graph-label" }); text.textContent = node.title;
    group.append(title, circle, text);
    if (!node.missing) {
      group.setAttribute("tabindex", "0"); group.setAttribute("role", "link"); group.setAttribute("aria-label", `${node.title}, ${node.path}`);
      group.addEventListener("click", event => open(node.path, event.shiftKey));
      group.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); open(node.path, event.shiftKey); }
      });
    }
    canvas.append(group);
  }
  canvas.addEventListener("keydown", event => {
    const distance = 40 / zoom;
    if (event.key === "ArrowLeft") x -= distance;
    else if (event.key === "ArrowRight") x += distance;
    else if (event.key === "ArrowUp") y -= distance;
    else if (event.key === "ArrowDown") y += distance;
    else return;
    event.preventDefault(); event.stopPropagation(); update();
  });
  host.replaceChildren(canvas);
  return {
    zoom(delta: number) { zoom = Math.max(0.2, Math.min(5, zoom + delta)); update(); },
    reset() { x = cx; y = cy; zoom = 1; update(); },
  };
}
