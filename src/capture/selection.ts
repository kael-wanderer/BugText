// The passage the owner selected, from the rendered preview or the editor, with the
// source line it starts on.

/** `line`..`endLine` are the 1-based source lines the passage spans; a preview passage ends
 *  at the line before the next block (Infinity after the last block). */
export type Passage = { quote: string; line: number; endLine: number; source: "editor" | "preview" };

const QUOTE_LIMIT = 2000;

/** Trims, collapses runs of blank lines, caps at 2,000 characters (cut at a word, then "…"). */
export function cleanQuote(text: string): string {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= QUOTE_LIMIT) return clean;
  const cut = clean.slice(0, QUOTE_LIMIT);
  const space = cut.search(/\s\S*$/);
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function blockOf(node: Node | null, pane: HTMLElement): { element: HTMLElement; line: number } | null {
  let element: Element | null = node instanceof Element ? node : node?.parentElement ?? null;
  while (element && element !== pane) {
    const line = Number((element as HTMLElement).dataset?.line);
    if (Number.isInteger(line) && line > 0) return { element: element as HTMLElement, line };
    element = element.parentElement;
  }
  return null;
}

/** The line before the first block after `end` (outside it) that starts on a later line. */
function lastLineOf(end: { element: HTMLElement; line: number }, pane: HTMLElement): number {
  for (const element of pane.querySelectorAll<HTMLElement>("[data-line]")) {
    if (end.element.contains(element)) continue;
    if (!(end.element.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    const line = Number(element.dataset.line);
    if (line > end.line) return line - 1;
  }
  return Infinity;
}

/** The selected text minus missing-image placeholders, which are not part of the note. */
function textWithoutPlaceholders(range: Range): string {
  const copy = range.cloneContents();
  copy.querySelectorAll(".img-missing").forEach((node) => node.replaceWith("\u0000"));
  return (copy.textContent ?? "").replace(/[ \t]*\u0000[ \t]*/g, " ");
}

/** Selection inside a rendered Markdown preview pane; null when empty or outside it. */
export function previewPassage(pane: HTMLElement, selection: Selection | null): Passage | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!pane.contains(range.startContainer) || !pane.contains(range.endContainer)) return null;
  const quote = cleanQuote(textWithoutPlaceholders(range));
  if (!quote) return null;
  const start = blockOf(range.startContainer, pane);
  const end = blockOf(range.endContainer, pane);
  if (!start) return null;
  return { quote, line: start.line, endLine: end ? lastLineOf(end, pane) : start.line, source: "preview" };
}

/** The editor's selected text and its 1-based line range; null when empty. */
export function editorPassage(text: string, lines: { from: number; to: number } | null): Passage | null {
  if (!lines) return null;
  const quote = cleanQuote(text);
  return quote ? { quote, line: lines.from, endLine: lines.to, source: "editor" } : null;
}
