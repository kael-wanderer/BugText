import { relativeTo, trackedFiles } from "./tracked";
import { REVIEW_ERROR, type ReviewAction, type ReviewItem, type ReviewRoute, type ReviewSnapshot } from "./types";

export type ReviewDeps = {
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
  folder(): string | null;
  /** The last folder listing and the folder it was taken from. */
  listing(): { folder: string | null; files: readonly string[]; complete: boolean };
  exclude(): readonly string[]; enabled(): boolean;
  onChange(snapshot: ReviewSnapshot | null, error: string | null): void;
};

export type ReviewController = ReturnType<typeof createReviewController>;

/** Sends scans and marks to Rust and caches the last snapshot. Never decides state. */
export function createReviewController(deps: ReviewDeps) {
  let cache: ReviewSnapshot | null = null;
  let running: Promise<void> | null = null;
  let again = false;

  const fail = (): void => { cache = null; deps.onChange(null, REVIEW_ERROR); };
  const take = (snapshot: ReviewSnapshot): void => {
    if (snapshot.folder !== deps.folder() || !deps.enabled()) return;
    cache = snapshot;
    deps.onChange(snapshot, null);
  };

  async function scanOnce(): Promise<void> {
    const folder = deps.folder();
    if (!folder || !deps.enabled()) { cache = null; deps.onChange(null, null); return; }
    // A listing taken for another folder (a switch still loading) is not this folder's.
    const listing = deps.listing();
    if (listing.folder !== folder) return;
    const { tracked: files, excluded } = trackedFiles(listing.files, folder, deps.exclude());
    try {
      take(await deps.invoke<ReviewSnapshot>("review_scan", { folder, files, excluded }));
    } catch {
      if (deps.folder() === folder) fail();
    }
  }

  function scan(): Promise<void> {
    if (running) { again = true; return running; }
    running = (async () => {
      try {
        do { again = false; await scanOnce(); } while (again);
      } finally { running = null; }
    })();
    return running;
  }

  async function mark(action: ReviewAction, paths: string[]): Promise<string[]> {
    const folder = deps.folder();
    if (!folder || !deps.enabled() || paths.length === 0) return [];
    const digest = (path: string) => cache?.items.find(i => i.path === path)?.digest ?? "";
    try {
      const result = await deps.invoke<{ snapshot: ReviewSnapshot; stale: string[] }>("review_mark", {
        folder, action, items: paths.map(path => ({ path, digest: digest(path) })),
      });
      take(result.snapshot);
      return result.stale;
    } catch {
      if (deps.folder() === folder) fail();
      return [];
    }
  }

  /** Labels the next change of these notes with a route. Never throws: it must not block a save. */
  async function expect(paths: string[], route: ReviewRoute): Promise<void> {
    const folder = deps.folder();
    if (!folder || !deps.enabled()) return;
    const relative = paths.map(p => relativeTo(folder, p)).filter((p): p is string => !!p);
    if (relative.length === 0) return;
    try { await deps.invoke<void>("review_expect", { folder, paths: relative, route }); } catch { /* labels are best effort */ }
  }

  async function base(path: string): Promise<string | null> {
    const folder = deps.folder();
    const relative = folder ? relativeTo(folder, path) : null;
    if (!folder || !relative) return null;
    try { return await deps.invoke<string | null>("review_base", { folder, path: relative }); } catch { return null; }
  }

  async function reset(): Promise<void> {
    const folder = deps.folder();
    if (!folder) return;
    try { await deps.invoke<ReviewSnapshot>("review_reset", { folder }); } catch { fail(); return; }
    await scan();
  }

  function item(absolutePath: string): ReviewItem | null {
    const folder = deps.folder();
    const relative = folder && cache ? relativeTo(folder, absolutePath) : null;
    return relative ? cache?.items.find(i => i.path === relative) ?? null : null;
  }

  return {
    scan, mark, expect, base, reset, item,
    accept: take,
    snapshot: (): ReviewSnapshot | null => cache,
  };
}
