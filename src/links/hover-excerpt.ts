import { scanMarkdownLines } from "../markdown-blocks";
import { markdownOutline } from "../outline";
import { headingAnchors } from "./parse";
export type Excerpt = { lines: string[]; total: number; heading: string | null; headingFound: boolean; truncated: boolean };
export function plainLine(line: string): string {
  return line.trim().replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "[image: $1]")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`+|\*|_)(.*?)\1/g, "$2").replace(/\s+#+\s*$/, "").trim();
}
export function noteExcerpt(source: string, anchor?: string, maxLines = 6, maxChars = 600): Excerpt {
  const scanned = scanMarkdownLines(source), headings = headingAnchors(markdownOutline(source));
  const match = anchor ? headings.find(heading => heading.anchor === anchor) : undefined;
  let start = match ? match.line - 1 : 0;
  if (!match) while (start < scanned.length && (scanned[start].code || !scanned[start].text.trim())) start++;
  const lines = scanned.slice(start).map(line => plainLine(line.text)).filter(Boolean);
  const selected = lines.slice(0, maxLines); let remaining = maxChars; let truncated = lines.length > maxLines;
  const limited: string[] = [];
  for (const line of selected) {
    if (remaining <= 0) { truncated = true; break; }
    if (line.length > remaining) { limited.push(line.slice(0, Math.max(0, remaining - 1)) + "…"); truncated = true; remaining = 0; break; }
    limited.push(line); remaining -= line.length;
  }
  return { lines: limited, total: lines.length, heading: match?.text ?? null, headingFound: !anchor || !!match, truncated };
}
