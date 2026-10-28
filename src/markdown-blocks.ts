/** Lines that Markdown treats as literal code or front matter. */
export function markdownCodeLines(source: string): boolean[] {
  const lines = source.split(/\r?\n/);
  const blocked = lines.map(() => false);
  let fence: { char: string; length: number } | null = null;
  let frontMatter = lines[0]?.trim() === "---";
  let htmlComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (frontMatter) {
      blocked[i] = true;
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line.trim())) frontMatter = false;
      continue;
    }
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      blocked[i] = true;
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = null;
      continue;
    }
    if (marker) { blocked[i] = true; fence = { char: marker[1][0], length: marker[1].length }; continue; }
    if (/^(?: {4}|\t)/.test(line)) { blocked[i] = true; continue; }
    let rest = line;
    let inComment: boolean = htmlComment;
    while (rest.length) {
      const start = rest.indexOf("<!--");
      const end = rest.indexOf("-->");
      if (inComment) {
        blocked[i] = true;
        if (end < 0) break;
        rest = rest.slice(end + 3); inComment = false;
      } else if (start >= 0) {
        blocked[i] = true;
        if (end < start) { inComment = true; break; }
        rest = rest.slice(end + 3);
      } else break;
    }
    htmlComment = inComment;
  }
  return blocked;
}
