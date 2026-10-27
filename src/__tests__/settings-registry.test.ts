import { describe, expect, it } from "vitest";
import { KEYMAP_COMMANDS } from "../keymap";
import {
  SETTING_ENTRIES,
  SETTINGS_PAGES,
  searchSettings,
} from "../settings-screen/registry";

describe("settings registry", () => {
  it("lists pages in owner's order", () => {
    expect(SETTINGS_PAGES.map((p) => p.id)).toEqual([
      "general",
      "editing",
      "theme",
      "shortcuts",
      "ai",
    ]);
  });

  it("search: empty query returns nothing", () =>
    expect(searchSettings("  ")).toEqual([]));

  it("search: case-insensitive, pages before settings", () => {
    const hits = searchSettings("THEME");
    expect(hits[0]).toMatchObject({ kind: "page", page: "theme" });
    expect(
      hits.some((h) => h.kind === "setting" && h.id === "theme-mode"),
    ).toBe(true);
  });

  it("search finds shortcut commands", () => {
    expect(searchSettings("command palette")[0]).toMatchObject({
      page: "shortcuts",
    });
  });

  it("search finds the app icon by 'logo'", () => {
    expect(searchSettings("logo").map((h) => h.id)).toContain("app-icon");
  });

  it("orders setting hits by page order, then entry order", () => {
    const order = SETTINGS_PAGES.map((p) => p.id);
    const settings = searchSettings("e").filter((h) => h.kind === "setting");
    const ranks = settings.map((h) => order.indexOf(h.page));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("has one entry per keymap command on the shortcuts page", () => {
    const shortcutEntries = SETTING_ENTRIES.filter(
      (e) => e.page === "shortcuts",
    );
    for (const command of KEYMAP_COMMANDS) {
      expect(shortcutEntries.some((e) => e.label === command.label)).toBe(true);
    }
  });

  it("entry ids are unique", () => {
    const ids = SETTING_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("search does not match nothing-like queries", () => {
    expect(searchSettings("zzzz-not-a-setting")).toEqual([]);
  });
});

it("routes rewrite search to Use for", () => {
  expect(searchSettings("rewrite")).toContainEqual(
    expect.objectContaining({ page: "ai", sub: "use-for", id: "use-rewrite" }),
  );
});
