import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import type { PropertyEdit } from "./edit";

export function applyPropertyEdit(view: EditorView, edit: PropertyEdit): void {
  view.dispatch({ changes: edit, userEvent: "input.properties", annotations: isolateHistory.of("full") });
}
