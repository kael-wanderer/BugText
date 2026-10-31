export function createFrameCoalescer(
  run: () => void,
  schedule: (fn: () => void) => number = fn => requestAnimationFrame(fn),
  cancel: (id: number) => void = id => cancelAnimationFrame(id),
) {
  let id: number | null = null;
  return {
    request() { if (id === null) id = schedule(() => { id = null; run(); }); },
    cancel() { if (id !== null) { cancel(id); id = null; } },
    pending: () => id !== null,
  };
}
