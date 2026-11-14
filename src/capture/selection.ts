// The passage the owner selected, from the rendered preview or the editor, with the
// source line it starts on.

export type Passage = { quote: string; line: number; source: "editor" | "preview" };

const QUOTE_LIMIT = 2000;

/** Trims, collapses runs of blank lines, caps at 2,000 characters (cut at a word, then "…"). */
export function cleanQuote(text: string): string {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= QUOTE_LIMIT) return clean;
  const cut = clean.slice(0, QUOTE_LIMIT);
  const space = cut.search(/\s\S*$/);
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function lineOf(node: Node | null, pane: HTMLElement): number | null {
  let element: Element | null = node instanceof Element ? node : node?.parentElement ?? null;
  while (element && element !== pane) {
    const line = Number((element as HTMLElement).dataset?.line);
    if (Number.isInteger(line) && line > 0) return line;
    element = element.parentElement;
  }
  return null;
}

/** Selection inside a rendered Markdown preview pane; null when empty or outside it. */
export function previewPassage(pane: HTMLElement, selection: Selection | null): Passage | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!pane.contains(range.startContainer) || !pane.contains(range.endContainer)) return null;
  const quote = cleanQuote(selection.toString());
  if (!quote) return null;
  const line = lineOf(range.startContainer, pane);
  return line === null ? null : { quote, line, source: "preview" };
}

/** The editor's selected text and its 1-based line range; null when empty. */
export function editorPassage(text: string, lines: { from: number; to: number } | null): Passage | null {
  if (!lines) return null;
  const quote = cleanQuote(text);
  return quote ? { quote, line: lines.from, source: "editor" } : null;
}
