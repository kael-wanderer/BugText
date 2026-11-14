/**
 * The tab strip's scroll position that shows the whole active tab while moving the
 * strip as little as possible. All values are in the strip's content coordinates:
 * `current` is its scrollLeft, `view` its visible width, `left` and `width` the tab's.
 */
export function revealScroll(current: number, view: number, left: number, width: number): number {
  if (left < current) return left;
  if (left + width > current + view) return Math.min(left, left + width - view);
  return current;
}
