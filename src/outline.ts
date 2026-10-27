export type OutlineHeading = {
  level: number;
  text: string;
  line: number;
};

export function plainHeadingText(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(`+)(.*?)\1/g, "$2")
    .replace(/(\*\*|~~)(?=\S)(.+?\S)\1/g, "$2")
    .replace(/(^|[^\w])__(?=\S)(.+?\S)__(?=$|[^\w])/g, (match, prefix: string, content: string) => /^init$/.test(content) ? match : prefix + content)
    .replace(/(^|[^\w])([*_])(?!\2)(?=\S)(.+?\S)\2(?!\2)(?=$|[^\w])/g, "$1$3")
    .trim();
}

export function markdownOutline(source: string): OutlineHeading[] {
  const lines = source.split(/\r?\n/);
  const headings: OutlineHeading[] = [];
  let fence: { char: string; length: number } | null = null;
  let comment = false;
  let frontMatter = lines[0]?.trim() === "---";
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (frontMatter) {
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line.trim())) frontMatter = false;
      continue;
    }
    if (comment) {
      const end = line.indexOf("-->");
      if (end < 0) continue;
      line = line.slice(end + 3);
      comment = false;
    }
    while (line.includes("<!--")) {
      const start = line.indexOf("<!--");
      const end = line.indexOf("-->", start + 4);
      if (end < 0) { line = line.slice(0, start); comment = true; break; }
      line = line.slice(0, start) + line.slice(end + 3);
    }
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = null;
      continue;
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; continue; }
    if (/^(?: {4}|\t)/.test(line)) continue;
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
