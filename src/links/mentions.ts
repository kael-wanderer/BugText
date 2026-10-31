import { scanMarkdownLines } from "../markdown-blocks";
import { formatLinkTarget, type NoteLink } from "./parse";
import type { NoteEdits } from "./rename-plan";
export type Mention = { path: string; line: number; from: number; to: number; text: string; lineText: string; column: number; source: string };
export function mentionTitle(activePath: string): string | null {
  const name = activePath.split(/[\\/]/).pop()?.replace(/\.(md|markdown)$/i, "") ?? "";
  return [...name].length >= 3 ? name : null;
}
export function mentionPattern(title: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "giu");
}
export function excludedRanges(source: string, links: NoteLink[]): [number, number][] {
  const ranges: [number, number][] = []; let offset = 0;
  const rawLines = source.split("\n");
  for (const [i, line] of scanMarkdownLines(source).entries()) { const length = rawLines[i].length; if (line.code) ranges.push([offset, offset + length]); offset += length + 1; }
  for (const expression of [/<!--[\s\S]*?(?:-->|$)/g, /(`+)([\s\S]*?)\1/g, /<[a-z][a-z\d+.-]*:[^>\n]*>/gi, /https?:\/\/[^\s<>]+/gi]) {
    for (const match of source.matchAll(expression)) ranges.push([match.index!, match.index! + match[0].length]);
  }
  for (const link of links) {
    const start = source.lastIndexOf("[", link.start); const lineEnd = source.indexOf("\n", link.end); const close = source.indexOf(")", link.end);
    ranges.push([Math.max(0, start), close >= 0 && (lineEnd < 0 || close < lineEnd) ? close + 1 : link.end]);
  }
  return ranges;
}
export function mentionsInNote(note: { path: string; source: string; links: NoteLink[] }, pattern: RegExp): Mention[] {
  const excluded = excludedRanges(note.source, note.links), mentions: Mention[] = []; let offset = 0;
  for (const [i, lineText] of note.source.split("\n").entries()) {
    pattern.lastIndex = 0;
    for (const match of lineText.matchAll(pattern)) {
      const from = offset + match.index!, to = from + match[0].length;
      if (!excluded.some(([start, end]) => from < end && to > start)) mentions.push({ path: note.path, line: i + 1, from, to, text: match[0], lineText, column: match.index!, source: note.source });
    }
    offset += lineText.length + 1;
  }
  return mentions;
}
export function mentionEdit(m: Mention, activePath: string): NoteEdits {
  return { path: m.path, source: m.source, edits: [{ from: m.from, to: m.to, insert: `[${m.text}](${formatLinkTarget(m.path, activePath)})`, line: m.line, before: m.text, inside: false, checked: true }] };
}
