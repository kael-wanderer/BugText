// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { showWorkspaceSwitcher } from "../workspaces/switcher";
import { showUnsavedWorkspaceSheet } from "../workspaces/unsaved-sheet";
import { sessionLayout } from "../workspaces/layout";
import { freshState } from "../state";
import type { Workspace, WorkspacesIO } from "../workspaces/store";

function workspace(id: string, name: string, extra: Partial<Workspace> = {}): Workspace {
  return { id, name, pinned: false, pinOrder: 0, openedAt: 0, folder: `/Users/me/${id}`, layout: sessionLayout(freshState()), ...extra };
}
function fixture(workspaces: Workspace[], recent: string[] = []) {
  let contents: string | null = JSON.stringify({ version: 1, workspaces, reopen: [] });
  const io: WorkspacesIO = { read: async () => contents, write: async value => { contents = value; }, broadcast: () => {} };
  const deps = { io, recent, home: "/Users/me", open: vi.fn(), openFolder: vi.fn(), saveFolder: vi.fn(), openFile: vi.fn(), changed: vi.fn() };
  return { deps, io, file: () => JSON.parse(contents!), set: (value: string) => { contents = value; } };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const headings = () => [...document.querySelectorAll("h3")].map(h => h.textContent);
const names = () => [...document.querySelectorAll(".workspace-switch-row > button:first-child")].map(b => b.textContent);
const press = (target: Element, key: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
afterEach(() => document.body.replaceChildren());

describe("workspace switcher", () => {
  it("groups pinned, workspaces newest first and recent folders, and filters", async () => {
    const f = fixture([
      workspace("a", "Blog", { openedAt: 1 }), workspace("b", "Book", { openedAt: 5 }),
      workspace("c", "Work", { pinned: true, pinOrder: 2 }), workspace("d", "Taxes", { pinned: true, pinOrder: 1 }),
    ], ["/Users/me/a", "/Users/me/photos"]);
    await showWorkspaceSwitcher(f.deps);
    expect(headings()).toEqual(["Pinned", "Workspaces", "Recent folders"]);
    expect(names()).toEqual(["Taxes", "Work", "Book", "Blog", "photos"]);
    expect(document.body.textContent).toContain("~/b");
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Filter workspaces"]')!;
    input.value = "bo"; input.dispatchEvent(new Event("input")); await tick();
    expect(names()).toEqual(["Book"]);
    press(input, "Enter");
    expect(f.deps.open).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("shows HTML-like names as text", async () => {
    const f = fixture([workspace("a", "<img src=x onerror=alert(1)>")]);
    await showWorkspaceSwitcher(f.deps);
    expect(document.querySelector(".workspace-switch-row img")).toBeNull();
    expect(names()).toEqual(["<img src=x onerror=alert(1)>"]);
  });

  it("deletes with Undo and tells the window the list changed", async () => {
    const f = fixture([workspace("a", "Blog"), workspace("b", "Book")]);
    await showWorkspaceSwitcher(f.deps);
    [...document.querySelectorAll("button")].filter(b => b.textContent === "Delete")[0].click(); await tick();
    expect(f.file().workspaces.map((w: Workspace) => w.id)).toEqual(["b"]);
    expect(names()).toEqual(["Book"]);
    [...document.querySelectorAll("button")].find(b => b.textContent === "Undo")!.click(); await tick();
    expect(f.file().workspaces.map((w: Workspace) => w.id).sort()).toEqual(["a", "b"]);
    expect(f.deps.changed).toHaveBeenCalledTimes(2);
  });

  it("renames inline and refuses a duplicate name", async () => {
    const f = fixture([workspace("a", "Blog"), workspace("b", "Book")]);
    await showWorkspaceSwitcher(f.deps);
    [...document.querySelectorAll("button")].filter(b => b.textContent === "Rename")[0].click();
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Workspace name"]')!;
    field.value = "book"; press(field, "Enter"); await tick();
    expect(f.file().workspaces[0].name).toBe("Blog");
    expect(document.body.textContent).toContain("not already used");
    field.value = "Journal"; press(field, "Enter"); await tick();
    expect(f.file().workspaces[0].name).toBe("Journal");
  });

  it("hides a recent folder that is already a workspace folder and offers Save as workspace", async () => {
    const f = fixture([workspace("a", "Blog")], ["/Users/me/a", "/Users/me/photos"]);
    await showWorkspaceSwitcher(f.deps);
    expect(names()).toEqual(["Blog", "photos"]);
    [...document.querySelectorAll("button")].find(b => b.textContent === "Save as workspace")!.click();
    expect(f.deps.saveFolder).toHaveBeenCalledWith("/Users/me/photos");
  });

  it("shows the read error with Open file for a malformed file", async () => {
    const f = fixture([]); f.set("{ broken");
    await showWorkspaceSwitcher(f.deps);
    expect(document.body.textContent).toContain("workspaces.json could not be read");
    [...document.querySelectorAll("button")].find(b => b.textContent === "Open file")!.click();
    expect(f.deps.openFile).toHaveBeenCalled();
  });
});

describe("unsaved sheet", () => {
  it("Cancel and Escape resolve cancel and remove the sheet", async () => {
    const choice = showUnsavedWorkspaceSheet(["<b>Draft</b>.md"]);
    expect(document.querySelector("li")!.textContent).toBe("<b>Draft</b>.md");
    [...document.querySelectorAll("button")].find(b => b.textContent === "Cancel")!.click();
    await expect(choice).resolves.toBe("cancel");
    expect(document.querySelector(".workspace-sheet")).toBeNull();
    const second = showUnsavedWorkspaceSheet(["a.md"]);
    press(document.querySelector(".workspace-sheet")!, "Escape");
    await expect(second).resolves.toBe("cancel");
  });
});
