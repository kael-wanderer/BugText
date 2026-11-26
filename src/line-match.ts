/** Document offsets of `match` on 1-based `line` of `text`, or null when the line no longer holds it. */
export function lineMatchRange(text: string, line: number, match: string): { from: number; to: number } | null {
  if (!match || line < 1) return null;
  let start = 0;
  for (let current = 1; current < line; current++) {
    const next = text.indexOf("\n", start);
    if (next < 0) return null;
    start = next + 1;
  }
  const end = text.indexOf("\n", start);
  const at = text.slice(start, end < 0 ? text.length : end).indexOf(match);
  return at < 0 ? null : { from: start + at, to: start + at + match.length };
}
