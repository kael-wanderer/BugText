// Table keys for Markdown documents: Tab / Shift-Tab between cells, Enter to the
// cell below, Shift-Enter for a line break inside a cell. Outside a table, or
// with several cursors, the keys keep their usual editor behavior.
import { isolateHistory } from "@codemirror/commands";
import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import { tableContext, tableEdit, type TableCommand, type TableContext } from "./table";

let formatOnEdit = true;

/** Settings ▸ Editing ▸ Format tables while editing. */
export function setTableFormatting(on: boolean): void {
  formatOnEdit = on;
}

export function tableContextAt(state: EditorState): TableContext | null {
  if (state.selection.ranges.length > 1) return null;
  return tableContext(state.doc.toString(), state.selection.main.head);
}

/** Runs a table command as one undo step; false when it does not apply here. */
export function runTableCommand(view: EditorView, command: TableCommand): boolean {
  const { state } = view;
  if (state.selection.ranges.length > 1) return false;
  const edit = tableEdit(state.doc.toString(), state.selection.main.head, command, formatOnEdit);
  if (!edit) return false;
  view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.insert },
    selection: { anchor: edit.anchor, head: edit.head },
    scrollIntoView: true,
    userEvent: "input.table",
    // Its own undo step, never merged with typing before or after it.
    annotations: isolateHistory.of("full"),
  });
  return true;
}

function lineBreakInCell(view: EditorView): boolean {
  if (!tableContextAt(view.state)) return false;
  view.dispatch(view.state.replaceSelection("<br>"), { scrollIntoView: true, userEvent: "input" });
  return true;
}

export function tableKeymap(): Extension {
  return Prec.high(keymap.of([
    { key: "Tab", run: (view) => runTableCommand(view, "next") },
    { key: "Shift-Tab", run: (view) => runTableCommand(view, "prev") },
    { key: "Enter", run: (view) => runTableCommand(view, "down") },
    { key: "Shift-Enter", run: lineBreakInCell },
  ]));
}
