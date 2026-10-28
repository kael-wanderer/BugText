// One pass over a Markdown source that tells line-based features (outline,
// tasks, tables) which lines are code or front matter and what each line reads
// as once HTML comments are removed.

export type MarkdownLine = {
  /** The line with HTML comments removed (multi-line comments included). */
  text: string;
  /** Front matter, fenced code (fence lines included) or indented code. */
  code: boolean;
};

const LIST_ITEM = /^\s*(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;

/** Lines of `source` split on "\n" (a trailing "\r" stays in the line). */
export function scanMarkdownLines(source: string): MarkdownLine[] {
  const lines = source.split("\n");
  const result: MarkdownLine[] = [];
  let fence: { char: string; length: number } | null = null;
  let frontMatter = lines[0]?.trim() === "---";
  let comment = false;
  let previousBlank = true;
  let previousCode = false;
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (frontMatter) {
      result.push({ text: line, code: true });
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontMatter = false;
      continue;
    }
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      result.push({ text: line, code: true });
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length
        && /^\s*$/.test(line.slice(marker[0].length))) fence = null;
      continue;
    }
    if (marker && !comment) {
      fence = { char: marker[1][0], length: marker[1].length };
      result.push({ text: line, code: true });
      previousBlank = false;
      continue;
    }
    const blank = line.trim() === "";
    // Indented code starts after a blank line outside a list and continues
    // while lines stay indented; inside lists indentation means nesting.
    const indented = /^(?: {4}|\t)/.test(line);
    if (indented && !blank && !comment && (previousCode || (previousBlank && !inList))) {
      result.push({ text: line, code: true });
      previousCode = true;
      previousBlank = false;
      continue;
    }
    previousCode = previousCode && blank;
    let text = "";
    let rest = line;
    while (rest) {
      if (comment) {
        const end = rest.indexOf("-->");
        if (end < 0) { rest = ""; break; }
        rest = rest.slice(end + 3);
        comment = false;
        continue;
      }
      const start = rest.indexOf("<!--");
      if (start < 0) { text += rest; break; }
      text += rest.slice(0, start);
      rest = rest.slice(start + 4);
      comment = true;
    }
    result.push({ text, code: false });
    if (!blank) inList = LIST_ITEM.test(line) || (inList && (indented || !previousBlank));
    previousBlank = blank;
  }
  return result;
}
