// Always loaded: the quote a clicked capture link carries back to its source.

function textBefore(container: Node, anchor: Node): string {
  const range = container.ownerDocument!.createRange();
  range.setStart(container, 0);
  range.setEndBefore(anchor);
  return range.toString();
}

/** The quote a capture link points at, or null for any other link. */
export function captureQuote(anchor: HTMLAnchorElement): string | null {
  const quote = anchor.closest("blockquote");
  if (quote) {
    const before = textBefore(quote, anchor);
    const lastBreak = before.lastIndexOf("\n");
    const after = (quote.textContent ?? "").slice(before.length + (anchor.textContent ?? "").length);
    if (lastBreak < 0 || !before.slice(lastBreak + 1).startsWith("— ") || after.trim().includes("\n")) return null;
    const text = before.slice(0, lastBreak).trim();
    return text || null;
  }
  const item = anchor.closest("li");
  if (item && anchor.textContent === "source" && item.classList.contains("task")) {
    const text = textBefore(item, anchor).replace(/\s*\($/, "").replace(/^\s*\[[ xX]\]\s*/, "").trim();
    return text || null;
  }
  return null;
}
