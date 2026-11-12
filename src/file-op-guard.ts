// Long file operations (duplicate, delete, copy, rename, move) run off the main
// thread, so the window stays live and a second click can arrive mid-flight. Only
// one runs at a time; repeat requests are ignored rather than queued, which also
// keeps two operations from touching the same path at once.
let busy = false;

export function isFileOpBusy(): boolean {
  return busy;
}

/** Runs `task` unless another file operation is in flight; returns undefined when ignored. */
export async function runExclusiveFileOp<T>(task: () => Promise<T>): Promise<T | undefined> {
  if (busy) return undefined;
  busy = true;
  document.body?.classList.add("file-op-busy");
  try {
    return await task();
  } finally {
    busy = false;
    document.body?.classList.remove("file-op-busy");
  }
}
