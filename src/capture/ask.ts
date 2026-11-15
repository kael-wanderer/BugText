// Ask AI about a passage: the source range to select so the AI panel's Selection chip
// carries it. Loaded on demand.

import { findQuoteInSource, lineOffset } from "./follow";
import type { Passage } from "./selection";

/** The exact passage when the source holds it as written; otherwise its whole lines
 *  (rendered text differs from source when it has inline Markdown), trailing blank lines dropped. */
export function askRange(text: string, passage: Passage): [number, number] {
  const from = lineOffset(text, passage.line);
  const found = findQuoteInSource(text, passage.quote, from);
  if (found) return found;
  const after = Number.isFinite(passage.endLine) ? lineOffset(text, passage.endLine + 1) : text.length;
  let to = Math.max(from, after);
  while (to > from && /\s/.test(text[to - 1])) to--;
  return [from, to];
}
