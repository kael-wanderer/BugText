// Folder search and superseded notes (spec 4.2): left out by default, or sent marked.
import type { RetrievedChunk } from "./conversation";

export type PickedExcerpts = { kept: RetrievedChunk[]; leftOut: string[] };

/** Keeps the first `k` excerpts; superseded ones are dropped (listed once in leftOut) or marked. */
export function pickExcerpts(pool: RetrievedChunk[], k: number, isSuperseded: (path: string) => boolean, include: boolean): PickedExcerpts {
  const kept: RetrievedChunk[] = [];
  const leftOut: string[] = [];
  for (const chunk of pool) {
    if (kept.length >= k) break;
    if (!isSuperseded(chunk.path)) kept.push(chunk);
    else if (include) kept.push({ ...chunk, superseded: true });
    else if (!leftOut.includes(chunk.path)) leftOut.push(chunk.path);
  }
  return { kept, leftOut };
}
