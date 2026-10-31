import { fileLanguageInfo, isPdfFile } from "../document-kind";
export function isFocusEligible(s: { pathOrName: string | null; tableView: boolean; graphActive: boolean }): boolean {
  if (!s.pathOrName || s.tableView || s.graphActive || isPdfFile(s.pathOrName)) return false;
  const kind = fileLanguageInfo(s.pathOrName).editor;
  return kind === "markdown" || kind === "plain";
}
export function escapeExitsFocus(event: KeyboardEvent, overlayOpen: boolean): boolean {
  return event.key === "Escape" && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !overlayOpen;
}
