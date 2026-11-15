// The way back from a saved excerpt or task: find the quote again in the source note
// and show it. Loads when a capture link is followed.

const BLOCKS = "p,li,blockquote,h1,h2,h3,h4,h5,h6,pre,td,th,dd,dt,figcaption";

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Whitespace-collapsed copy of `text` plus, per output character, its source offset. */
function collapse(text: string): { flat: string; at: number[] } {
  let flat = "";
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      if (flat.endsWith(" ") || !flat) continue;
      flat += " "; at.push(i);
    } else { flat += text[i]; at.push(i); }
  }
  return { flat, at };
}

/** Same search in source text; returns [from, to] offsets or null. */
export function findQuoteInSource(text: string, quote: string, fromOffset: number): [number, number] | null {
  const wanted = squash(quote);
  if (!wanted) return null;
  const { flat, at } = collapse(text);
  let start = at.findIndex((offset) => offset >= fromOffset);
  if (start < 0) start = flat.length;
  let found = flat.indexOf(wanted, start);
  if (found < 0) found = flat.indexOf(wanted);
  if (found < 0) return null;
  return [at[found], at[found + wanted.length - 1] + 1];
}

/** First match of `quote` in the rendered preview, from the block at or after `fromLine`. */
export function findQuote(pane: HTMLElement, quote: string, fromLine: number): Range | null {
  const wanted = squash(quote);
  if (!wanted) return null;
  const doc = pane.ownerDocument;
  const walker = doc.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
  let flat = "";
  const map: [Text, number][] = [];
  let lastBlock: Element | null = null;
  let start = -1;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const holder = node.parentElement;
    if (holder?.closest(".img-missing")) continue; // a missing-image placeholder is not note text
    const owner = holder?.closest(BLOCKS) ?? null;
    if (owner !== lastBlock && flat && !flat.endsWith(" ")) { flat += " "; map.push([node, 0]); }
    lastBlock = owner;
    if (start < 0) {
      const lined = holder?.closest<HTMLElement>("[data-line]");
      if (lined && Number(lined.dataset.line) >= fromLine) start = flat.length;
    }
    const text = node.data;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) {
        if (!flat || flat.endsWith(" ")) continue;
        flat += " ";
      } else flat += text[i];
      map.push([node, i]);
    }
  }
  let found = start < 0 ? -1 : flat.indexOf(wanted, start);
  if (found < 0) found = flat.indexOf(wanted);
  if (found < 0) return null;
  const [startNode, startOffset] = map[found];
  const [endNode, endOffset] = map[found + wanted.length - 1];
  const range = doc.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset + 1);
  return range;
}

let clearTimer: number | undefined;

/** Highlights the range for 4 s and scrolls it into view; falls back to selecting it. */
export function showQuote(pane: HTMLElement, range: Range): void {
  const target = range.startContainer.parentElement ?? pane;
  target.scrollIntoView({ block: "center" });
  const view = pane.ownerDocument.defaultView as (Window & { Highlight?: new (...ranges: Range[]) => unknown; CSS?: { highlights?: Map<string, unknown> } }) | null;
  const registry = view?.CSS?.highlights;
  if (view?.Highlight && registry) {
    registry.set("capture-quote", new view.Highlight(range));
    if (clearTimer !== undefined) view.clearTimeout(clearTimer);
    clearTimer = view.setTimeout(() => registry.delete("capture-quote"), 4000);
    return;
  }
  const selection = pane.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Offset of the start of 1-based `line` in `text` (the end of the text past its last line). */
export function lineOffset(text: string, line: number): number {
  let offset = 0;
  for (let at = 1; at < line; at++) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return offset;
}
