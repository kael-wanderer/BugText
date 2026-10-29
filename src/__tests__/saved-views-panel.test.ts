// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createSavedViewsPanel } from "../saved-views/panel";
import type { SavedView } from "../saved-views/model";
import type { SavedViewStore } from "../saved-views/store";
import type { FilterModel } from "../properties/filter-query";

function tag(key: string): FilterModel["tags"][number] {
  return { key, exclude: false };
}

function view(id: string, name: string, key: string): SavedView {
  return { id, name, folder: "/notes", filter: { mode: "all", folder: null, tags: [tag(key)], rows: [] }, sort: "path", descending: false };
}

function fakeStore(items: SavedView[]) {
  const store = {
    items,
    error: null as string | null,
    loaded: true,
    subscribe: () => () => {},
    reload: vi.fn(async () => {}),
    update: vi.fn(async (change: (items: SavedView[]) => SavedView[]) => {
      store.items = change(structuredClone(store.items));
    }),
  };
  return store;
}

function setup(items: SavedView[], filter: FilterModel) {
  const host = document.createElement("div");
  document.body.append(host);
  const store = fakeStore(items);
  createSavedViewsPanel(host, {
    store: store as unknown as SavedViewStore,
    getFolder: () => "/notes",
    getFilter: () => filter,
    apply: vi.fn(),
  });
  return { host, store };
}

function button(host: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(host.querySelectorAll("button")).find(b => b.textContent === text)!;
}

describe("saved views panel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("Update selected keeps the selected view's own name when the name field is empty", async () => {
    const home: FilterModel = { mode: "all", folder: null, tags: [tag("home")], rows: [] };
    const { host, store } = setup([view("a", "Active notes", "active")], home);

    button(host, "Active notes").click();
    const nameField = host.querySelector<HTMLInputElement>('input[aria-label="View name"]')!;
    nameField.value = "";
    nameField.dispatchEvent(new Event("input"));
    button(host, "Update selected").click();
    await Promise.resolve();

    expect(store.update).toHaveBeenCalledTimes(1);
    expect(store.items).toEqual([view("a", "Active notes", "home")]);
  });

  it("Save as new with an empty name does not write and shows the error beside the buttons", () => {
    const { host, store } = setup([], { mode: "all", folder: null, tags: [], rows: [] });

    button(host, "Save as new").click();

    const status = host.querySelector("[role=status]");
    expect(status?.textContent).toBe("Enter a view name.");
    expect(store.update).not.toHaveBeenCalled();
    expect(button(host, "Update selected").compareDocumentPosition(status!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Update selected is disabled until a view is selected", () => {
    const { host } = setup([view("a", "Active notes", "active")], { mode: "all", folder: null, tags: [], rows: [] });

    expect(button(host, "Update selected").disabled).toBe(true);
  });
});
