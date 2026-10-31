export type RefreshReason = "timer" | "focus" | "manual";
export type RefreshKind = "full" | "tabs";
export type RefreshTick = { at: number; reason: RefreshReason; kind: RefreshKind; walkMs: number | null; scanMs: number | null; reread: number; sentBytes: number; receivedBytes: number; renders: number; tabsChecked: number };
export type DiagnosticsTotals = { notes: number; walked: number; capped: boolean; heldTextBytes: number; aiChunks: number; large: boolean };

export function createDiagnostics(limit = 20) {
  const history: RefreshTick[] = [];
  let active: RefreshTick | null = null;
  let totals: DiagnosticsTotals = { notes: 0, walked: 0, capped: false, heldTextBytes: 0, aiChunks: 0, large: false };
  return {
    begin(reason: RefreshReason, kind: RefreshKind) {
      active = { at: Date.now(), reason, kind, walkMs: null, scanMs: null, reread: 0, sentBytes: 0, receivedBytes: 0, renders: 0, tabsChecked: 0 };
      history.unshift(active); history.length = Math.min(history.length, Math.max(0, limit));
      return active;
    },
    current: () => active,
    end() { active = null; },
    countRender() { if (active) active.renders++; },
    setTotals(value: DiagnosticsTotals) { totals = { ...value }; },
    ticks: (): readonly RefreshTick[] => history,
    totals: () => ({ ...totals }),
    asText() {
      const lines = [`Notes: ${totals.notes}; walked: ${totals.walked}; capped: ${totals.capped}; text bytes: ${totals.heldTextBytes}; AI chunks: ${totals.aiChunks}; large: ${totals.large}`];
      for (const t of history) lines.push(`${t.at} ${t.reason} ${t.kind} walk ${t.walkMs ?? "-"} scan ${t.scanMs ?? "-"} reread ${t.reread} sent ${t.sentBytes} received ${t.receivedBytes} renders ${t.renders} tabs ${t.tabsChecked}`);
      return lines.join("\n");
    },
  };
}
