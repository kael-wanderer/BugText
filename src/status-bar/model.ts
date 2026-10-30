import type { EditorState } from "@codemirror/state";

/** Shared with the preview: count source tokens, including frontmatter and code. */
export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function cursorPosition(state: Pick<EditorState, "doc" | "selection">): { line: number; column: number } {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number, column: head - line.from + 1 };
}

export function cursorLabel(position: { line: number; column: number }): string {
  return `Ln ${position.line}, Col ${position.column}`;
}

export function saveStateText(dirty: boolean, recovered: boolean): string {
  return recovered ? "Recovered draft" : dirty ? "Unsaved" : "Saved";
}
