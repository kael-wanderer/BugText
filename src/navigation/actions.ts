import { joinPath, relativePath } from "../paths";
import { createBookmarkStore, type Bookmark } from "./bookmarks";
import { openBookmark } from "./open-bookmark";
import { showBookmarkSheet } from "./sheet";

export function createBookmarkActions(deps: {
  host: () => HTMLElement;
  folder: () => string | null;
  current: () => { path: string; name: string; line: number } | null;
  exists: (path: string) => Promise<void>;
  read: (path: string) => Promise<string>;
  open: (path: string, text: string, line: number) => Promise<void>;
  toast: (message: string) => void;
}) {
  const store = createBookmarkStore();
  let sheet: ReturnType<typeof showBookmarkSheet> | undefined;
  async function add() {
    const folder = deps.folder(), source = deps.current();
    const path = source && folder ? relativePath(folder, source.path) : null;
    if (!folder || !source || !path || path === source.path) {
      deps.toast("Open a saved note inside the open folder to add a bookmark."); return;
    }
    const bookmark: Bookmark = { id: crypto.randomUUID(), label: `${source.name} · line ${source.line}`.slice(0, 120), folder, destination: { kind: "note", path, line: source.line } };
    try {
      if (!store.loaded) await store.reload();
      await store.update(items => [...items, bookmark]);
      deps.toast("Bookmark added.");
    } catch { deps.toast("Could not save bookmark."); }
  }
  function show() {
    sheet?.close();
    sheet = showBookmarkSheet(deps.host(), {
      store, getFolder: deps.folder,
      available: async bookmark => {
        if (bookmark.destination.kind !== "note") return true;
        await deps.exists(joinPath(bookmark.folder, bookmark.destination.path));
        return true;
      },
      open: async bookmark => {
        const folder = deps.folder();
        const opened = await openBookmark(bookmark, {
          folder, read: deps.read,
          open: async (path, text, line) => {
            if (folder !== deps.folder()) throw new Error("Folder changed");
            await deps.open(path, text, line);
          },
        });
        if (opened) { sheet?.close(); sheet = undefined; }
        else { deps.toast("Missing or unavailable bookmark."); sheet?.render(); }
      },
    }, () => void add());
  }
  return { add, show, refresh: () => sheet?.render() };
}
