import { describe, expect, it, vi } from "vitest";
import type { MenuItem } from "../contextmenu";
import { KEYMAP_COMMANDS } from "../keymap";
import { TABLE_MENU_COMMANDS, tableCommandFromId, tableMenuItems } from "../table-menu";

type Entry = Exclude<MenuItem, "separator">;
const entries = (items: MenuItem[]): Entry[] => items.filter((item): item is Entry => item !== "separator");

describe("table menu", () => {
  it("maps menu ids to commands and rejects others", () => {
    expect(tableCommandFromId("table.delete_col")).toBe("delete_col");
    expect(tableCommandFromId("table.next")).toBeNull();
    expect(tableCommandFromId("edit.toggle_task")).toBeNull();
  });

  it("has a keymap entry for every table command", () => {
    const ids = new Set(KEYMAP_COMMANDS.map((command) => command.id));
    for (const command of TABLE_MENU_COMMANDS) expect(ids.has(command.id)).toBe(true);
  });

  it("disables header-only and single-column actions", () => {
    const items = entries(tableMenuItems({ row: 0, column: 0, columns: 1, rows: 2 }, () => {}));
    const disabled = items.filter((item) => item.disabled).map((item) => item.label);
    expect(disabled).toEqual(["Insert Row Above", "Delete Row", "Delete Column"]);
  });

  it("runs the chosen command", () => {
    const run = vi.fn();
    const items = entries(tableMenuItems({ row: 1, column: 0, columns: 2, rows: 3 }, run));
    items.find((item) => item.label === "Format Table")?.action?.();
    entries(items.find((item) => item.label === "Align Column")!.children!)[1].action?.();
    expect(run.mock.calls).toEqual([["format"], ["align_center"]]);
  });
});
