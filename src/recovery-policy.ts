export type DraftRecord = {
  id: string;
  path: string | null;
  name: string;
  contents: string;
  updatedAt: number;
  windowId: string;
};

export type DiskState = { mtimeMs: number; size: number } | null;
export type ChangeDecision = "unchanged" | "reload" | "conflict" | "deleted";
export type SnapshotEntry = {
  ts: number;
  size: number;
  label?: string;
  kind?: "binary";
};

const KEEP_MIN = 10;
const MAX_TOTAL = 50;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function fileIdFor(path: string): string {
  return `f${hashText(path)}`;
}

export function draftIdFor(path: string | null, fallbackId: string): string {
  return path ? fileIdFor(path) : `u${hashText(fallbackId)}`;
}

/** PDF edits recover through their own drafts; a text draft for a PDF is noise. */
export function isPdfDraft(draft: DraftRecord): boolean {
  return /\.pdf$/i.test(draft.path ?? draft.name);
}

export function isRecoverableDraft(draft: DraftRecord): boolean {
  return draft.contents.trim().length > 0 && !isPdfDraft(draft);
}

export function changeDecision(
  recorded: DiskState,
  current: DiskState,
  dirty: boolean,
): ChangeDecision {
  if (current === null) return "deleted";
  if (recorded === null) return "unchanged";
  if (
    recorded.mtimeMs === current.mtimeMs &&
    recorded.size === current.size
  ) {
    return "unchanged";
  }
  return dirty ? "conflict" : "reload";
}

export function shouldSnapshot(
  previousHash: string | null,
  newHash: string,
): boolean {
  return previousHash !== newHash;
}

export function snapshotsToPrune(
  entries: SnapshotEntry[],
  nowMs: number,
): number[] {
  const sorted = [...entries].sort((left, right) => right.ts - left.ts);
  const prune: number[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    if (index < KEEP_MIN) continue;
    const tooOld = nowMs - sorted[index].ts > MAX_AGE_MS;
    const overCap = index >= MAX_TOTAL;
    if (tooOld || overCap) prune.push(sorted[index].ts);
  }
  return prune;
}
import { hashText } from "./hash";

export { hashText } from "./hash";

export type DraftState = "Newer than file" | "File changed after draft" | "New document" | "Same as file" | "File missing" | "Already open, unsaved";

export function draftState(draft: DraftRecord, stat: DiskState, diskText: string | null, openTab: { dirty: boolean; text: string } | null): DraftState {
  if (openTab?.dirty && openTab.text !== draft.contents) return "Already open, unsaved";
  if (!draft.path) return "New document";
  if (!stat) return "File missing";
  if (diskText === draft.contents) return "Same as file";
  return stat.mtimeMs > draft.updatedAt ? "File changed after draft" : "Newer than file";
}
