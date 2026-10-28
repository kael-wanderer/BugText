export type OutlineHeading = {
  level: number;
  text: string;
  line: number;
};

export function plainHeadingText(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(`+)(.*?)\1/g, "$2")
    .replace(/(\*\*|~~)(?=\S)(.+?\S)\1/g, "$2")
    .replace(/(^|[^\w])__(?=\S)(.+?\S)__(?=$|[^\w])/g, "$1$2")
    .replace(/(^|[^\w])([*_])(?!\2)(?=\S)(.+?\S)\2(?!\2)(?=$|[^\w])/g, "$1$3")
    .trim();
}

export function markdownOutline(source: string): OutlineHeading[] {
  const lines = source.split(/\r?\n/);
  const headings: OutlineHeading[] = [];
  const blocked = markdownCodeLines(source);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (blocked[i]) continue;
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) continue;
    const atx = /^ {0,3}(#{1,6})(?:\s+|$)(.*)$/.exec(line);
    if (atx) {
      headings.push({ level: atx[1].length, text: plainHeadingText(atx[2].replace(/\s+#+\s*$/, "")), line: i + 1 });
      continue;
    }
    if (line.trim() && !/^ {0,3}(?:> |>(?:$|\s)|[-+*]\s|\d+[.)]\s|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/.test(line) && i + 1 < lines.length) {
      const setext = /^ {0,3}(=+|-+)\s*$/.exec(lines[i + 1]);
      if (setext) {
        headings.push({ level: setext[1][0] === "=" ? 1 : 2, text: plainHeadingText(line), line: i + 1 });
        i++;
      }
    }
  }
  return headings;
}
import { markdownCodeLines } from "./markdown-blocks";
