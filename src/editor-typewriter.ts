import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
export function typewriterExtension(): Extension {
  return EditorState.transactionExtender.of(tr => {
    if ((!tr.selection && !tr.docChanged) || tr.isUserEvent("select.pointer")) return null;
    if (!["input", "delete", "select", "undo", "redo"].some(event => tr.isUserEvent(event))) return null;
    return { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: "center" }) };
  });
}
