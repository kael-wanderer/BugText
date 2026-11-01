import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { findFrontMatter } from "../properties/frontmatter";

export const EXCLUDED_NODES = ["FencedCode", "CodeBlock", "InlineCode", "URL", "Autolink", "HTMLTag", "HTMLBlock", "Comment", "CommentBlock", "ProcessingInstruction", "LinkReference"] as const;
const excluded = new Set<string>(EXCLUDED_NODES);

export function spellMask(state: EditorState, from: number, to: number, kind: "markdown" | "plain"): string | null {
  const source = state.doc.sliceString(from, to);
  if (kind === "plain") return source;
  const tree = ensureSyntaxTree(state, to, 50);
  // Parser not caught up yet: the caller retries rather than caching a blank mask.
  if (!tree) return null;
  const chars = source.split("");
  const mask = (start: number, end: number) => {
    for (let i = Math.max(from, start); i < Math.min(to, end); i++) if (chars[i - from] !== "\n") chars[i - from] = " ";
  };
  if (from < 4096) {
    const front = findFrontMatter(state.doc.toString());
    if (front) mask(front.start, front.end);
  }
  tree.iterate({ from, to, enter(node) { if (excluded.has(node.name)) { mask(node.from, node.to); return false; } } });
  // Track display fences from the start so a viewport inside a block is still masked.
  let display = false;
  const lastLine = state.doc.lineAt(to).number;
  for (let n = 1; n <= lastLine; n++) {
    const line = state.doc.line(n);
    if (/^\s*\$\$\s*$/.test(line.text)) { display = !display; mask(line.from, line.to); }
    else if (display) mask(line.from, line.to);
    else if (line.to >= from) {
      for (const match of line.text.matchAll(/\$(?=\S)[^$\n]*?\S\$/g)) mask(line.from + match.index!, line.from + match.index! + match[0].length);
      for (const match of line.text.matchAll(/https?:\/\/[^\s<>]+/g)) mask(line.from + match.index!, line.from + match.index! + match[0].length);
    }
  }
  return chars.join("");
}
