export type Rotation = 0 | 90 | 180 | 270;
export type PlanPage = { key: string; source: "self" | string; index: number; rotation: Rotation };
export type Inserted = { id: string; name: string; path: string; bytes: Uint8Array; pageCount: number };
export type PagePlan = { pages: PlanPage[]; inserts: Map<string, Inserted>; selfCount: number };
export const MAX_PLAN_PAGES = 2000;
export const MAX_INSERT_BYTES = 200 * 1024 * 1024;
export function initialPlan(pageCount: number): PagePlan {
  return { pages: Array.from({ length: pageCount }, (_, index) => ({ key: `self:${index}`, source: "self", index, rotation: 0 })), inserts: new Map(), selfCount: pageCount };
}
export function movePages(plan: PagePlan, keys: string[], toIndex: number): PagePlan {
  const selected = new Set(keys); const moving = plan.pages.filter(p => selected.has(p.key));
  if (!moving.length) return plan;
  const gap = Math.max(0, Math.min(plan.pages.length, toIndex));
  const before = plan.pages.slice(0, gap).filter(p => !selected.has(p.key)).length;
  const rest = plan.pages.filter(p => !selected.has(p.key));
  rest.splice(before, 0, ...moving);
  return rest.every((p, i) => p === plan.pages[i]) ? plan : { ...plan, pages: rest };
}
export function rotatePages(plan: PagePlan, keys: string[], delta: 90 | -90): PagePlan {
  const selected = new Set(keys); let changed = false;
  const pages = plan.pages.map(p => { if (!selected.has(p.key)) return p; changed = true; return { ...p, rotation: ((p.rotation + delta + 360) % 360) as Rotation }; });
  return changed ? { ...plan, pages } : plan;
}
export function deletePages(plan: PagePlan, keys: string[]): PagePlan | { error: "A PDF needs at least one page." } {
  const selected = new Set(keys); const pages = plan.pages.filter(p => !selected.has(p.key));
  if (!pages.length) return { error: "A PDF needs at least one page." };
  return pages.length === plan.pages.length ? plan : { ...plan, pages };
}
export function insertPages(plan: PagePlan, inserted: Inserted, atIndex: number): PagePlan {
  let id = inserted.id; let suffix = 2;
  while (id === "self" || plan.inserts.has(id)) id = `${inserted.id}:${suffix++}`;
  const source = { ...inserted, id }; const inserts = new Map(plan.inserts); inserts.set(id, source);
  const pages = [...plan.pages]; pages.splice(Math.max(0, Math.min(pages.length, atIndex)), 0, ...Array.from({ length: source.pageCount }, (_, index) => ({ key: `${id}:${index}`, source: id, index, rotation: 0 as Rotation })));
  return { ...plan, pages, inserts };
}
export function isChanged(plan: PagePlan): boolean {
  return plan.pages.length !== plan.selfCount || plan.pages.some((p, i) => p.source !== "self" || p.index !== i || p.rotation !== 0);
}
export function changeSummary(plan: PagePlan, selfCount: number): { moved: number; rotated: number; deleted: number; inserted: number } {
  const self = plan.pages.filter(p => p.source === "self");
  const tails: number[] = [];
  for (const page of self) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (tails[mid] < page.index) lo = mid + 1; else hi = mid; }
    tails[lo] = page.index;
  }
  return { moved: self.length - tails.length, rotated: plan.pages.filter(p => p.rotation !== 0).length, deleted: selfCount - self.length, inserted: plan.pages.length - self.length };
}
export type History = { past: PagePlan[]; present: PagePlan; future: PagePlan[] };
export function historyPush(h: History, next: PagePlan): History { return next === h.present ? h : { past: [...h.past, h.present], present: next, future: [] }; }
export function historyUndo(h: History): History { return h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h; }
export function historyRedo(h: History): History { return h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h; }
