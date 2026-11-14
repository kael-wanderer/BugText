import { lineDiff } from "../ai/diff";
import type { OutlineHeading } from "../outline";

/** `lines` are 1-based lines of the current text, ascending and unique. */
export type Changes = { added: number; removed: number; lines: number[] };

export function changedLines(base: string, current: string): Changes {
  const lines = new Set<number>();
  let added = 0, removed = 0, line = 0;
  // A run of deletions with no addition beside it is anchored to the line after it.
  let runDeleted = false, runAdded = false;
  const closeRun = (anchor: number): void => {
    if (runDeleted && !runAdded) lines.add(anchor);
    runDeleted = runAdded = false;
  };
  for (const part of lineDiff(base, current)) {
    if (part.type === "same") { line++; closeRun(line); continue; }
    if (part.type === "add") { line++; added++; runAdded = true; lines.add(line); }
    else { removed++; runDeleted = true; }
  }
  closeRun(Math.max(1, line));
  return { added, removed, lines: [...lines].sort((a, b) => a - b) };
}

/** Marks the top-level `[data-line]` blocks of the pane that cover a changed line. */
export function markBlocks(pane: HTMLElement, lines: readonly number[]): HTMLElement[] {
  pane.querySelectorAll(".review-changed").forEach(el => el.classList.remove("review-changed", "review-current"));
  const blocks = [...pane.querySelectorAll<HTMLElement>("[data-line]")]
    .filter(el => !el.parentElement?.closest("[data-line]"));
  const marked: HTMLElement[] = [];
  blocks.forEach((block, i) => {
    const start = Number(block.dataset.line);
    const next = i + 1 < blocks.length ? Number(blocks[i + 1].dataset.line) : Infinity;
    const end = next > start ? next - 1 : start;
    if (Number.isFinite(start) && lines.some(line => line >= start && line <= end)) {
      block.classList.add("review-changed");
      marked.push(block);
    }
  });
  return marked;
}

/** Lines of the headings that own at least one changed line. */
export function changedSections(headings: readonly OutlineHeading[], lines: readonly number[]): Set<number> {
  const owners = new Set<number>();
  for (const line of lines) {
    let owner: OutlineHeading | undefined;
    for (const heading of headings) { if (heading.line <= line) owner = heading; else break; }
    if (owner) owners.add(owner.line);
  }
  return owners;
}

/** Index of the block to step to from `scrollTop`, or -1 at either end. No wrapping. */
export function stepTarget(tops: readonly number[], scrollTop: number, direction: 1 | -1): number {
  if (direction === 1) return tops.findIndex(top => top > scrollTop + 1);
  for (let i = tops.length - 1; i >= 0; i--) if (tops[i] < scrollTop - 1) return i;
  return -1;
}
