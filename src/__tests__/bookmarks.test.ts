// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
import { createBookmarkStore, validBookmark, type Bookmark } from "../navigation/bookmarks";
import { createBookmarkPanel } from "../navigation/panel";
import { openBookmark } from "../navigation/open-bookmark";
import { createBookmarkActions } from "../navigation/actions";

const bookmark = (id: string, folder = "/notes", label = id): Bookmark => ({ id, folder, label, destination: { kind: "note", path: `${id}.md`, line: 12 } });
let saved: Bookmark[], revision: number;
beforeEach(() => {
  document.body.replaceChildren(); saved = []; revision = 0; invoke.mockReset();
  invoke.mockImplementation(async (command, args) => {
    if (command === "write_workflow_store") { saved = structuredClone(args.items); revision++; }
    return { version: 1, revision, items: structuredClone(saved) };
  });
});
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

it("persists bookmarks and displays only the selected folder after reload/switch", async () => {
  const first = createBookmarkStore(); await first.reload();
  await first.update(() => [bookmark("A"), bookmark("B", "/other")]); first.dispose();
  const store = createBookmarkStore(); await store.reload();
  expect(store.items[0].destination).toEqual({ kind: "note", path: "A.md", line: 12 });
  let folder = "/notes";
  const host = document.createElement("div");
  const open = vi.fn();
  const panel = createBookmarkPanel(host, { store, getFolder: () => folder, open });
  await flush();
  expect(host.querySelector("button")?.textContent).toBe("A");
  folder = "/other"; panel.render();
  expect(host.querySelector("button")?.textContent).toBe("B");
  folder = "/none"; panel.render();
  expect(host.querySelector(".bookmark-row")).toBeNull();
  panel.dispose(); store.dispose();
});

it("renders malicious bookmark labels and paths as literal text without image elements", async () => {
  const text = "<img src=x onerror=alert(1)>";
  saved = [{ ...bookmark("a", "/notes", text), destination: { kind: "note", path: text + ".md", line: 12 } }];
  const store = createBookmarkStore(); await store.reload();
  const host = document.createElement("div");
  const panel = createBookmarkPanel(host, { store, getFolder: () => "/notes", open: vi.fn() });
  expect(host.querySelector("button")?.textContent).toBe(text);
  expect(host.querySelector("small")?.textContent).toContain(text);
  expect(host.querySelector("img")).toBeNull(); panel.dispose(); store.dispose();
});

it("shows Missing and never opens a tab for a deleted file, even on activation", async () => {
  saved = [bookmark("gone")];
  const store = createBookmarkStore(); await store.reload();
  const read = vi.fn(async () => { throw new Error("private path and stack"); });
  const openTab = vi.fn();
  const host = document.createElement("div");
  const panel = createBookmarkPanel(host, { store, getFolder: () => "/notes", available: async () => { throw new Error("private details"); },
    open: async b => { await openBookmark(b, { folder: "/notes", read, open: openTab }); },
  });
  await flush();
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Missing");
  host.querySelector("button")!.click(); await flush();
  expect(read).toHaveBeenCalledWith("/notes/gone.md");
  expect(openTab).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("private"); panel.dispose(); store.dispose();
});

it("opens a bookmark at its line only after a successful read and rejects a different folder", async () => {
  const read = vi.fn(async () => "a\nb"), open = vi.fn();
  expect(await openBookmark(bookmark("a"), { folder: "/notes", read, open })).toBe(true);
  expect(open).toHaveBeenCalledWith("/notes/a.md", "a\nb", 12);
  open.mockClear(); read.mockClear();
  expect(await openBookmark(bookmark("a"), { folder: "/other", read, open })).toBe(false);
  expect(read).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
});

it("rejects invalid line numbers and path escapes at the storage boundary", () => {
  for (const path of ["../a.md", "/a.md", "..\\a.md", "C:\\a.md"]) expect(validBookmark({ ...bookmark("a"), destination: { kind: "note", path } })).toBe(false);
  for (const line of [0, -1, 1.5, "12"]) expect(validBookmark({ ...bookmark("a"), destination: { kind: "note", path: "a.md", line } })).toBe(false);
});

it("Add Bookmark captures the current note and line and refuses notes outside the folder", async () => {
  let path = "/notes/nested/a.md";
  const toast = vi.fn();
  const actions = createBookmarkActions({ host: () => document.body, folder: () => "/notes", current: () => ({ path, name: "a.md", line: 42 }), exists: async () => {}, read: async () => "", open: async () => {}, toast });
  await actions.add();
  expect(saved[0].destination).toEqual({ kind: "note", path: "nested/a.md", line: 42 });
  path = "/notes-other/a.md"; await actions.add();
  expect(saved).toHaveLength(1); expect(toast).toHaveBeenLastCalledWith("Open a saved note inside the open folder to add a bookmark.");
});

it("hides storage failure details from the bookmark panel", async () => {
  invoke.mockRejectedValue(new Error("private stack trace"));
  const store = createBookmarkStore(); await store.reload();
  const host = document.createElement("div");
  const panel = createBookmarkPanel(host, { store, getFolder: () => "/notes", open: vi.fn() });
  expect(host.textContent).toContain("Could not load bookmarks.");
  expect(host.textContent).not.toContain("private"); panel.dispose(); store.dispose();
});

it("Show Bookmarks focuses the opening button and opens at the saved line on activation", async () => {
  saved = [bookmark("a")];
  const open = vi.fn(async () => {});
  const actions = createBookmarkActions({ host: () => document.body, folder: () => "/notes", current: () => null, exists: async () => {}, read: async () => "note contents", open, toast: vi.fn() });
  actions.show(); await flush();
  const button = document.querySelector<HTMLButtonElement>(".bookmark-row button")!;
  expect(document.activeElement).toBe(button);
  // Native button semantics provide Enter activation in the webview.
  expect(button.tagName).toBe("BUTTON"); button.click(); await flush();
  expect(open).toHaveBeenCalledWith("/notes/a.md", "note contents", 12);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("rechecks existence when a file disappears after the list was shown", async () => {
  saved = [bookmark("a")];
  const open = vi.fn(async () => {}), toast = vi.fn();
  const actions = createBookmarkActions({ host: () => document.body, folder: () => "/notes", current: () => null, exists: async () => {}, read: async () => { throw new Error("deleted"); }, open, toast });
  actions.show(); await flush();
  document.querySelector<HTMLButtonElement>(".bookmark-row button")!.click(); await flush();
  expect(open).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith("Missing or unavailable bookmark.");
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
