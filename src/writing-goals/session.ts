export type SessionState = { goal: number; startedAt: number; written: number };
export type SessionTracker = {
  start(goal: number, counts: ReadonlyMap<string, number>, now: number): void;
  clear(): void;
  observe(tabId: string, count: number): void;
  rebase(tabId: string): void;
  state(): SessionState | null;
};

export function createSessionTracker(): SessionTracker {
  let current: { goal: number; startedAt: number } | null = null;
  const entries = new Map<string, { base: number; last: number; rebase: boolean }>();
  return {
    start(goal, counts, now) {
      current = { goal, startedAt: now };
      entries.clear();
      for (const [id, count] of counts) entries.set(id, { base: count, last: count, rebase: false });
    },
    clear() { current = null; entries.clear(); },
    observe(id, count) {
      if (!current) return;
      const entry = entries.get(id);
      if (!entry) { entries.set(id, { base: count, last: count, rebase: false }); return; }
      if (entry.rebase) { entry.base += count - entry.last; entry.rebase = false; }
      entry.last = count;
    },
    rebase(id) { const entry = entries.get(id); if (entry) entry.rebase = true; },
    state() {
      if (!current) return null;
      let written = 0;
      for (const entry of entries.values()) written += entry.last - entry.base;
      return { ...current, written: Math.max(0, written) };
    },
  };
}

export function crossed(memory: Map<string, number>, key: string, value: number, goal: number): boolean {
  const previous = memory.get(key);
  if (previous === Infinity) return false;
  if (previous === undefined) { memory.set(key, value >= goal ? Infinity : value); return false; }
  if (previous < goal && value >= goal) { memory.set(key, Infinity); return true; }
  memory.set(key, value);
  return false;
}
