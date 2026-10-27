export type ScrollAnchor = { line: number; offset: number };

function interpolate(value: number, anchors: ScrollAnchor[], from: "line" | "offset", to: "line" | "offset"): number {
  if (!anchors.length) return 0;
  if (value <= anchors[0][from]) return anchors[0][to];
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (value <= b[from]) {
      const span = b[from] - a[from];
      return span <= 0 ? b[to] : a[to] + (b[to] - a[to]) * (value - a[from]) / span;
    }
  }
  return anchors[anchors.length - 1][to];
}
export const lineToOffset = (line: number, anchors: ScrollAnchor[]): number => interpolate(line, anchors, "line", "offset");
export const offsetToLine = (offset: number, anchors: ScrollAnchor[]): number => interpolate(offset, anchors, "offset", "line");

export function createScrollGuard(now: () => number = () => performance.now()) {
  let driver: "editor" | "preview" | null = null;
  let last = -Infinity;
  const ignored = new Map<string, number>();
  return {
    ignore(pane: "editor" | "preview") { ignored.set(pane, now() + 150); },
    drive(pane: "editor" | "preview"): boolean {
      const time = now();
      if ((ignored.get(pane) ?? -Infinity) >= time) { ignored.delete(pane); return false; }
      if (driver && driver !== pane && time - last < 150) return false;
      driver = pane; last = time; return true;
    },
  };
}
