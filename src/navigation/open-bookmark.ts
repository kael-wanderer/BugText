import { joinPath } from "../paths";
import { resolveBookmarkHeading, validBookmark, type Bookmark } from "./bookmarks";

/** Read successfully before touching tabs, even when a stale tab already exists. */
export async function openBookmark(bookmark: Bookmark, deps: {
  folder: string | null;
  read: (path: string) => Promise<string>;
  open: (path: string, text: string, line: number) => Promise<void> | void;
}): Promise<boolean> {
  if (!validBookmark(bookmark) || bookmark.folder !== deps.folder || bookmark.destination.kind !== "note") return false;
  const destination = bookmark.destination;
  const path = joinPath(bookmark.folder, destination.path);
  try {
    const text = await deps.read(path);
    const line = destination.line ?? resolveBookmarkHeading(text, destination).line;
    await deps.open(path, text, line);
    return true;
  } catch { return false; }
}
