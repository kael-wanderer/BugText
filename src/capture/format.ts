// Capture while reading: the text an excerpt, a task or a note entry writes, and the
// link back to the passage it came from. Pure functions only.

import { markdownOutline } from "../outline";
import { formatLinkTarget, headingAnchors } from "../links/parse";

export { companionPath } from "./paths";

export type SourceRef = { title: string; heading: string | null; anchor: string | null };

const fileName = (path: string): string => path.replace(/\\/g, "/").split("/").pop() ?? path;
const stem = (path: string): string => fileName(path).replace(/\.[^.]+$/, "");

/** The heading at or above `line` (1-based); null above the first heading. Title is the first
 *  level-1 heading, else the file stem. */
export function sourceRef(sourcePath: string, sourceText: string, line: number): SourceRef {
  const headings = headingAnchors(markdownOutline(sourceText));
  const title = headings.find((h) => h.level === 1)?.text || stem(sourcePath);
  let nearest: (typeof headings)[number] | null = null;
  for (const heading of headings) {
    if (heading.line > line) break;
    nearest = heading;
  }
  return { title, heading: nearest?.text ?? null, anchor: nearest?.anchor ?? null };
}

const oneLine = (text: string): string => text.replace(/[[\]\r\n]+/g, " ").replace(/\s+/g, " ").trim();

/** "Architecture › Sync model", or "Architecture" without a heading (or when the heading is the title). */
export function linkLabel(ref: SourceRef): string {
  const title = oneLine(ref.title);
  if (!ref.heading) return title;
  const heading = oneLine(ref.heading);
  return heading === title ? title : `${title} › ${heading}`;
}

/** Relative Markdown link target from the note that receives the entry to the source. */
export function linkTarget(fromNote: string, sourcePath: string, ref: SourceRef): string {
  return formatLinkTarget(fromNote, sourcePath, ref.anchor ?? undefined);
}

/** Rendered text (a preview selection) as Markdown that renders back to the same text:
 *  backslash before \ ` * _ [ ] < > &, and before a block marker at the start of a line. */
export function escapeMarkdown(text: string): string {
  return text.split("\n").map((line) => line
    .replace(/[\\`*_[\]<>&]/g, (c) => `\\${c}`)
    .replace(/^(\s*)([#+-])/, "$1\\$2")
    .replace(/^(\s*\d+)\./, "$1\\.")).join("\n");
}

const endWithNewline = (text: string): string => (text.endsWith("\n") ? text : `${text}\n`);

/** The excerpt block of spec 3.2, ending with exactly one newline. */
export function excerptBlock(quote: string, label: string, target: string, date: string, comment: string): string {
  const quoted = quote.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n").map((line) => `> ${line}`.trimEnd());
  const block = [...quoted, `> — [${label}](${target}) · ${date}`].join("\n") + "\n";
  const note = comment.replace(/\r\n?/g, "\n").trim();
  return note ? `${block}\n${endWithNewline(note)}` : block;
}

/** `- [ ] <text> ([source](<target>))`; newlines in `text` become spaces. */
export function taskLine(text: string, target: string): string {
  return `- [ ] ${text.replace(/\s+/g, " ").trim()} ([source](${target}))\n`;
}

/** Starter text of a new companion note. */
export function companionStarter(sourcePath: string, title: string): string {
  return `---\nabout: ${fileName(sourcePath)}\n---\n\n# Notes on ${oneLine(title)}\n\n`;
}

/** Add note entry for HTML files. */
export function noteEntry(title: string, target: string, date: string, comment: string): string {
  const head = `**${date}** — [${oneLine(title)}](${target})\n`;
  const note = comment.replace(/\r\n?/g, "\n").trim();
  return note ? `${head}\n${endWithNewline(note)}` : head;
}
