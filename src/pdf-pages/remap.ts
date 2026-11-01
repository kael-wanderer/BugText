import type { Annotation } from "../pdf-annotations/model";
import type { PagePlan } from "./plan";
export function rotateRect(r: [number, number, number, number], w: number, h: number, quarterTurns: number): [number, number, number, number] {
  let [x, y, rw, rh] = r;
  for (let n = ((quarterTurns % 4) + 4) % 4; n > 0; n--) { [x, y, rw, rh] = [h - y - rh, x, rh, rw]; [w, h] = [h, w]; }
  return [x, y, rw, rh];
}
export function remapAnnotations(list: Annotation[], plan: PagePlan, sizes: { width: number; height: number }[]): { kept: Annotation[]; removed: Annotation[] } {
  const positions = new Map(plan.pages.flatMap((p, i) => p.source === "self" ? [[p.index, { page: i + 1, rotation: p.rotation }] as const] : []));
  const kept: Annotation[] = []; const removed: Annotation[] = [];
  for (const item of list) {
    const position = positions.get(item.page - 1);
    if (!position) { removed.push(item); continue; }
    const size = sizes[item.page - 1];
    if (!size) throw new Error(`Missing size for page ${item.page}`);
    kept.push({ ...item, page: position.page, rects: item.rects.map(r => rotateRect(r, size.width, size.height, position.rotation / 90)) });
  }
  return { kept, removed };
}
