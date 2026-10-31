import type { RefreshKind, RefreshReason } from "./perf/diagnostics";

type Request = { kind: RefreshKind; reason: RefreshReason; resolve: () => void; reject: (error: unknown) => void };
export function createRefreshRunner(run: (kind: RefreshKind, reason: RefreshReason) => Promise<void>) {
  let active = false;
  let queued: Request[] = [];
  async function process(batch: Request[]) {
    active = true;
    const full = batch.find(request => request.kind === "full");
    const chosen = full ?? batch[0];
    try { await run(chosen.kind, chosen.reason); batch.forEach(request => request.resolve()); }
    catch (error) { batch.forEach(request => request.reject(error)); }
    finally {
      if (queued.length) { const next = queued; queued = []; void process(next); }
      else active = false;
    }
  }
  return {
    request(kind: RefreshKind, reason: RefreshReason): Promise<void> {
      return new Promise((resolve, reject) => {
        const request = { kind, reason, resolve, reject };
        if (active) queued.push(request); else void process([request]);
      });
    },
    running: () => active,
  };
}

export function createFocusDeduper(action: () => void, now = () => Date.now()) {
  let last = -Infinity;
  return () => { const time = now(); if (time - last < 250) return; last = time; action(); };
}
