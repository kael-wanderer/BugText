import { organizeSheet, node, action } from "../notes/sheet";
import { createBookmarkPanel } from "./panel";

export function showBookmarkSheet(host: HTMLElement, deps: Parameters<typeof createBookmarkPanel>[1], add?: () => void) {
  const sheet = organizeSheet(host, "Show Bookmarks");
  if (add) sheet.body.append(action("Add Bookmark", add));
  const content = node("div");
  sheet.body.append(content);
  const panel = createBookmarkPanel(content, { ...deps, open: async bookmark => { await deps.open(bookmark); } });
  sheet.cleanup(panel.dispose);
  let focused = false;
  function focusFirst() {
    if (focused || sheet.closed) return;
    const first = content.querySelector<HTMLButtonElement>(".bookmark-row button");
    if (first) { first.focus(); focused = true; }
  }
  sheet.cleanup(deps.store.subscribe(() => queueMicrotask(focusFirst)));
  focusFirst();
  return { render: panel.render, close: sheet.close };
}
