import { invoke } from "@tauri-apps/api/core";

// Unsaved PDF edits live in one file per PDF in the app config folder (see
// `pdf_drafts.rs`). Earlier versions kept them in browser storage, which has a
// small quota; those drafts move to a file the first time they are read.

function legacyKey(path: string): string {
  return `bugtext.pdf.edits.${encodeURIComponent(path)}`;
}

function takeLegacyDraft(path: string): string | null {
  try {
    const raw = window.localStorage.getItem(legacyKey(path));
    if (raw) window.localStorage.removeItem(legacyKey(path));
    return raw;
  } catch {
    return null;
  }
}

type WriteQueue = {
  running: Promise<boolean>;
  /** Latest contents waiting to be written; undefined when nothing is waiting. */
  next: string | null | undefined;
};

const queues = new Map<string, WriteQueue>();

/** Reads the stored draft text for `path`, or null when there is none. */
export async function readPdfDraft(path: string): Promise<string | null> {
  // A write still in flight is the newest state.
  const queue = queues.get(path);
  if (queue) {
    if (queue.next !== undefined) return queue.next;
    await queue.running;
  }
  const stored = await invoke<string | null>("pdf_draft_read", { path }).catch(() => null);
  if (stored) return stored;
  const legacy = takeLegacyDraft(path);
  if (legacy) await writePdfDraft(path, legacy);
  return legacy;
}

/**
 * Stores `contents` as the draft for `path` (null removes it). Writes for one path
 * run in order and only the latest waiting one is kept, so fast edits never land
 * out of order. Resolves false when the write failed.
 */
export function writePdfDraft(path: string, contents: string | null): Promise<boolean> {
  const queue = queues.get(path);
  if (queue) {
    queue.next = contents;
    return queue.running;
  }
  const state: WriteQueue = { running: Promise.resolve(true), next: contents };
  state.running = (async () => {
    let ok = true;
    while (state.next !== undefined) {
      const value = state.next;
      state.next = undefined;
      ok = await invoke("pdf_draft_write", { path, contents: value }).then(
        () => true,
        () => false,
      );
    }
    queues.delete(path);
    return ok;
  })();
  queues.set(path, state);
  return state.running;
}
