// The Table menu shared by the editor's right-click menu and the format bar's
// table button. Command ids match Edit ▸ Table in menu.rs and keymap.ts.
import type { MenuItem } from "./contextmenu";
import type { TableCommand, TableContext } from "./table";

export const TABLE_MENU_COMMANDS: { id: `table.${TableCommand}`; label: string }[] = [
  { id: "table.row_above", label: "Insert Row Above" },
  { id: "table.row_below", label: "Insert Row Below" },
  { id: "table.col_left", label: "Insert Column Left" },
  { id: "table.col_right", label: "Insert Column Right" },
  { id: "table.delete_row", label: "Delete Row" },
  { id: "table.delete_col", label: "Delete Column" },
  { id: "table.align_left", label: "Align Column Left" },
  { id: "table.align_center", label: "Align Column Center" },
  { id: "table.align_right", label: "Align Column Right" },
  { id: "table.align_none", label: "Remove Column Alignment" },
  { id: "table.format", label: "Format Table" },
  { id: "table.delete", label: "Delete Table" },
];

export function tableCommandFromId(id: string): TableCommand | null {
  return TABLE_MENU_COMMANDS.some((command) => command.id === id) ? id.slice(6) as TableCommand : null;
}

export function tableMenuItems(context: TableContext, run: (command: TableCommand) => void): MenuItem[] {
  const item = (id: `table.${TableCommand}`, disabled = false): MenuItem => ({
    label: TABLE_MENU_COMMANDS.find((command) => command.id === id)!.label,
    disabled,
    action: () => run(id.slice(6) as TableCommand),
  });
  const header = context.row === 0;
  return [
    item("table.row_above", header),
    item("table.row_below"),
    item("table.col_left"),
    item("table.col_right"),
    "separator",
    item("table.delete_row", header),
    item("table.delete_col", context.columns === 1),
    "separator",
    {
      label: "Align Column",
      children: [
        item("table.align_left"),
        item("table.align_center"),
        item("table.align_right"),
        item("table.align_none"),
      ],
    },
    item("table.format"),
    "separator",
    item("table.delete"),
  ];
}
