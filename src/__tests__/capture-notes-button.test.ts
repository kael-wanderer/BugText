import { describe, expect, it } from "vitest";
import { countEntries, notesLabel } from "../capture/notes-button";
import { KEYMAP_COMMANDS } from "../keymap";

// The project has no Node type definitions; give fs the one call used here.
const { readFileSync } = (await import("node:fs" as string)) as {
  readFileSync: (path: string, encoding: "utf8") => string;
};

describe("Notes button", () => {
  it("counts excerpts, tasks are not entries, and notes", () => {
    const text = [
      "---", "about: a.md", "---", "", "# Notes on A", "",
      "> quoted", "> — [A · Intro](a.md#intro) · 2026-11-14", "",
      "> other", "> — [A](a.md) · 2026-11-14", "",
      "**2026-11-14** — [A](a.md)", "a comment", "",
      "> — not an entry because it has no link",
      "- [ ] Verify x ([source](a.md#intro))",
    ].join("\n");
    expect(countEntries(text)).toBe(3);
    expect(countEntries("")).toBe(0);
  });
  it("labels the button with the count", () => {
    expect(notesLabel(0)).toBe("Notes");
    expect(notesLabel(3)).toBe("Notes · 3");
  });
});

describe("capture commands", () => {
  const menu = readFileSync("src-tauri/src/menu.rs", "utf8");
  it("exist in the keymap and the native menu with the same ids", () => {
    for (const [id, label] of [["edit.capture_excerpt", "Save Excerpt…"], ["edit.capture_task", "Task from Selection…"], ["view.companion_note", "Open Notes"]]) {
      expect(KEYMAP_COMMANDS.find((command) => command.id === id)).toMatchObject({ label, scope: "menu" });
      expect(menu).toContain(`MenuItemBuilder::with_id("${id}", "${label}")`);
    }
  });
  it("binds Save Excerpt to Cmd-Shift-E without a clash", () => {
    expect(KEYMAP_COMMANDS.find((command) => command.id === "edit.capture_excerpt")?.default).toBe("CmdOrCtrl+Shift+E");
    expect(KEYMAP_COMMANDS.filter((command) => command.default === "CmdOrCtrl+Shift+E")).toHaveLength(1);
  });
});
