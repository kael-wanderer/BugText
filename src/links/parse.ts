import { scanMarkdownLines } from "../markdown-blocks";
import { plainHeadingText, type OutlineHeading } from "../outline";

export type NoteLink = { target: string; line: number; start: number; end: number; text: string };

function escaped(text: string, at: number): boolean {
  let count = 0;
  while (at > 0 && text[--at] === "\\") count++;
  return count % 2 === 1;
}

/** Destination ranges use UTF-16 offsets into the original document. */
export function noteLinks(source: string): NoteLink[] {
  const result: NoteLink[] = [];
  let offset = 0;
  const rawLines = source.split("\n");
  const maskedLines = source.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => comment.replace(/[^\n]/g, " ")).split("\n");
  scanMarkdownLines(source).forEach((line, index) => {
    const raw = rawLines[index];
    if (!line.code) {
      const visible = maskedLines[index];
      const add = (at: number, label: string, inline: boolean) => {
        while (/\s/.test(visible[at] ?? "") && at < visible.length) at++;
        const angle = visible[at] === "<";
        const start = angle ? at + 1 : at;
        let end = start;
        let depth = 0;
        for (; end < visible.length; end++) {
          const c = visible[end];
          if (escaped(visible, end)) continue;
          if (angle && c === ">") break;
          if (!angle) {
            if (/\s/.test(c) || (c === ")" && depth === 0)) break;
            if (c === "(") depth++;
            if (c === ")") depth--;
          }
        }
        const after = visible.slice(end + (angle ? 1 : 0));
        const closed = !inline || /^\s*(?:["'][^"']*["']\s*)?\)/.test(after);
        if (closed && end > start && (!angle || visible[end] === ">")) {
          result.push({ target: raw.slice(start, end), line: index + 1,
            start: offset + start, end: offset + end, text: label });
        }
        return end;
      };
      for (let i = 0; i < visible.length; i++) {
        if (escaped(visible, i)) continue;
        if (visible[i] === "`") {
          let n = 1;
          while (visible[i + n] === "`") n++;
          const close = visible.indexOf("`".repeat(n), i + n);
          if (close >= 0) i = close + n - 1;
          else i += n - 1;
          continue;
        }
        if (visible[i] !== "[" || (visible[i - 1] === "!" && !escaped(visible, i - 1))) continue;
        let close = i + 1;
        let depth = 1;
        for (; close < visible.length; close++) {
          if (escaped(visible, close)) continue;
          if (visible[close] === "[") depth++;
          if (visible[close] === "]" && --depth === 0) break;
        }
        const label = raw.slice(i + 1, close);
        if (visible[close + 1] === "(") i = add(close + 2, label, true);
        else if (visible[close + 1] === ":" && /^ {0,3}$/.test(visible.slice(0, i))) i = add(close + 2, label, false);
      }
    }
    offset += raw.length + 1;
  });
  return result;
}

export function headingAnchors(headings: OutlineHeading[]): (OutlineHeading & { anchor: string })[] {
  const used = new Set<string>();
  return headings.map((heading) => {
    const base = plainHeadingText(heading.text).toLowerCase().replace(/[^\p{L}\p{N} -]/gu, "").replace(/ /g, "-");
    let anchor = base;
    for (let suffix = 1; used.has(anchor); suffix++) anchor = `${base}-${suffix}`;
    used.add(anchor);
    return { ...heading, anchor };
  });
}

export function formatLinkTarget(fromNote: string, toNote: string, anchor?: string): string {
  const from = fromNote.replace(/\\/g, "/").split("/").slice(0, -1);
  const to = toNote.replace(/\\/g, "/").split("/");
  while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
  const path = [...from.map(() => ".."), ...to].join("/") + (anchor === undefined ? "" : `#${anchor}`);
  return /[ ()]/.test(path) ? `<${path}>` : path;
}
