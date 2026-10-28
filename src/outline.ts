import { scanMarkdownLines } from "./markdown-blocks";

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
  const lines = scanMarkdownLines(source);
  const headings: OutlineHeading[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].code) continue;
    const line = lines[i].text;
    const atx = /^ {0,3}(#{1,6})(?:\s+|$)(.*)$/.exec(line);
    if (atx) {
      headings.push({ level: atx[1].length, text: plainHeadingText(atx[2].replace(/\s+#+\s*$/, "")), line: i + 1 });
      continue;
    }
    const next = lines[i + 1];
    if (line.trim() && next && !next.code && !/^ {0,3}(?:> |>(?:$|\s)|[-+*]\s|\d+[.)]\s|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/.test(line)) {
      const setext = /^ {0,3}(=+|-+)\s*$/.exec(next.text);
      if (setext) {
        headings.push({ level: setext[1][0] === "=" ? 1 : 2, text: plainHeadingText(line), line: i + 1 });
        i++;
      }
    }
  }
  return headings;
}
