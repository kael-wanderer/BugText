import { scanMarkdownLines } from "../markdown-blocks";
import { noteLinks, formatLinkTarget } from "../links/parse";
import { parentPath, relativePath } from "../paths";
import { relativeDestination } from "../templates/naming";

export type SourceBinding = { tabId: string; path: string | null; text: string; revision: number; from: number; to: number };
export type SourceChange = { from: number; to: number; insert: string };
export type ExtractPlan = { source: SourceBinding; dir: string; stem: string; contents: string; title: string };

/** First release extracts beside the source, so local image/link destinations remain valid. */
export function planExtraction(source: SourceBinding, folder: string, title: string): ExtractPlan {
  if (!source.path || !/\.(md|markdown)$/i.test(source.path)) throw new Error("Save this Markdown note before extracting a selection.");
  if (!source.path.startsWith(folder.replace(/\/$/, "") + "/")) throw new Error("The note must be inside the open folder.");
  if (!title.trim()) throw new Error("Enter a title for the new note.");
  const { text, from, to } = source;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > text.length || from >= to || !text.slice(from, to).trim()) throw new Error("Select a paragraph or section first.");
  if ((from > 0 && text[from - 1] !== "\n") || (to < text.length && text[to - 1] !== "\n" && text[to] !== "\n")) throw new Error("Select complete lines to extract a paragraph or section.");
  const lines = scanMarkdownLines(text);
  const first = text.slice(0, from).split("\n").length - 1;
  const last = text.slice(0, to - 1).split("\n").length - 1;
  // Fenced blocks, frontmatter and comments need structural extraction beyond v1.
  if (lines.slice(first, last + 1).some((line, index) => line.code || line.text !== text.split("\n")[first + index])) {
    throw new Error("Select ordinary Markdown paragraphs or headings, outside code, properties and comments.");
  }
  let contents = text.slice(from, to);
  // References whose definitions live outside the selection would break.
  if (/(?<!!)\[[^\]\n]+\](?:\[[^\]\n]*\]|(?!\())/.test(contents) || /!\[[^\]\n]*\](?!\()/.test(contents)) throw new Error("Reference-style links need to stay with their definitions. Use inline links before extracting.");
  // A same-note anchor in the original means the original note, even after extraction.
  for (const link of noteLinks(contents).filter(link => link.target.startsWith("#")).reverse()) {
    const target = formatLinkTarget(source.path, source.path, link.target.slice(1));
    contents = contents.slice(0, link.start) + target + contents.slice(link.end);
  }
  const destination = relativeDestination(relativePath(folder, parentPath(source.path)), title);
  if ("error" in destination) throw new Error(destination.error);
  return { source, dir: destination.dir, stem: destination.stem, title: title.trim(), contents };
}

export function extractionReplacement(plan: ExtractPlan, targetPath: string): SourceChange {
  const label = plan.title.replace(/[\\[\]]/g, "\\$&").replace(/[\r\n]+/g, " ");
  const selected = plan.source.text.slice(plan.source.from, plan.source.to);
  return { from: plan.source.from, to: plan.source.to, insert: `[${label}](${formatLinkTarget(plan.source.path!, targetPath)})${selected.endsWith("\n") ? "\n" : ""}` };
}
