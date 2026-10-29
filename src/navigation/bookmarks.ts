import { createWorkflowStore } from "../saved-views/store";
import { headingAnchors } from "../links/parse";
import { markdownOutline } from "../outline";
export type BookmarkDestination = { kind: "note"; path: string; line?: number; anchor?: string; heading?: string } | { kind: "search"; query: string } | { kind: "view"; viewId: string };
export type Bookmark = { id: string; label: string; folder: string; destination: BookmarkDestination };
export function validBookmark(value: unknown): value is Bookmark {
  const b = value as Bookmark; if (!b || typeof b.id !== "string" || !b.id || typeof b.label !== "string" || !b.label.trim() || b.label.length > 120 || typeof b.folder !== "string" || !b.folder || !b.destination) return false;
  const d = b.destination;
  return d.kind === "note" ? typeof d.path === "string" && !!d.path && !d.path.startsWith("/") && !/[\\:]/.test(d.path) && !d.path.split("/").includes("..") && (d.line === undefined || (Number.isSafeInteger(d.line) && d.line > 0)) && (!d.anchor || typeof d.anchor === "string") : d.kind === "search" ? typeof d.query === "string" : d.kind === "view" && typeof d.viewId === "string";
}
export function resolveBookmarkHeading(source: string, destination: Extract<BookmarkDestination, {kind:"note"}>) {
  const headings = headingAnchors(markdownOutline(source));
  if (!destination.anchor) return { line: 1, missing: false };
  const exact = headings.find(h => h.anchor === destination.anchor);
  if (exact && (!destination.heading || exact.text === destination.heading)) return { line: exact.line, missing: false };
  const matches = headings.filter(h => h.text === destination.heading);
  return matches.length === 1 ? { line: matches[0].line, missing: false } : { line: 1, missing: true };
}
export function createBookmarkStore() { return createWorkflowStore<Bookmark>("bookmarks", validBookmark); }
export type BookmarkStore = ReturnType<typeof createBookmarkStore>;
export function renameBookmarks(items: Bookmark[], folder: string, oldPath: string, newPath: string): Bookmark[] {
  return items.map(b => b.folder === folder && b.destination.kind === "note" && (b.destination.path === oldPath || b.destination.path.startsWith(oldPath + "/")) ? { ...b, destination: { ...b.destination, path: newPath + b.destination.path.slice(oldPath.length) } } : b);
}
