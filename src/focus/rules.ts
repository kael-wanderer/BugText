import { fileLanguageInfo, isPdfFile } from "../document-kind";
export function isFocusEligible(s: { pathOrName: string | null; tableView: boolean; graphActive: boolean }): boolean {
  if (!s.pathOrName || s.tableView || s.graphActive || isPdfFile(s.pathOrName)) return false;
  const kind = fileLanguageInfo(s.pathOrName).editor;
  return kind === "markdown" || kind === "plain";
}
export function escapeExitsFocus(event: KeyboardEvent, overlayOpen: boolean): boolean {
  return event.key === "Escape" && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !overlayOpen;
}
/**
 * Focus mode never changes the selection. On exit the saved top line is restored only when
 * the caret has not moved since entry; otherwise null, and the caller keeps the caret in view.
 */
export function focusExitScroll(saved: { topLine: number; selection: { from: number; to: number } }, current: { from: number; to: number }): number | null {
  return saved.selection.from === current.from && saved.selection.to === current.to ? saved.topLine : null;
}
