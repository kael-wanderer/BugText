import { formatLinkTarget, noteLinks } from "../links/parse";

export type AnnotationColor = "yellow" | "green" | "blue" | "pink";
export type Annotation = {
  id: string; group: string | null; page: number; rects: [number, number, number, number][];
  quote: string; color: AnnotationColor; comment: string; created: string; updated: string;
};
export type AnnotationDocument = { version: 1; path: string; digest: string; pages: number; revision: number; annotations: Annotation[] };
export type ExportOptions = { quotes: boolean; comments: boolean; pageLinks: boolean; groupByPage: boolean };

export function normalizeQuote(text: string): string {
  const value = text.replace(/-\s*\n\s*/g, "").replace(/\s+/g, " ").trim();
  const chars = Array.from(value);
  return chars.length > 2000 ? chars.slice(0, 1999).join("") + "…" : value;
}
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function sortAnnotations(list: Annotation[]): Annotation[] {
  return [...list].sort((a, b) => a.page - b.page || (a.rects[0]?.[1] ?? 0) - (b.rects[0]?.[1] ?? 0) || (a.rects[0]?.[0] ?? 0) - (b.rects[0]?.[0] ?? 0));
}
export function filterAnnotations(list: Annotation[], colors: AnnotationColor[], text: string): Annotation[] {
  const query = text.trim().toLocaleLowerCase();
  return sortAnnotations(list).filter((a) => (!colors.length || colors.includes(a.color)) && (!query || `${a.quote}\n${a.comment}`.toLocaleLowerCase().includes(query)));
}
export function parsePdfAnchor(anchor: string): { page?: number; annotation?: string } {
  const match = /^page=([1-9]\d*)(?:&annotation=([a-z0-9]{6,16}))?$/.exec(anchor);
  if (!match) return {};
  const page = Number(match[1]);
  if (!Number.isSafeInteger(page)) return {};
  return match[2] ? { page, annotation: match[2] } : { page };
}
function filename(path: string): string { return path.replace(/\\/g, "/").split("/").pop() || path; }
function label(text: string): string { return text.replace(/([\\\[\]])/g, "\\$1").replace(/[\r\n]+/g, " "); }
function target(dir: string, path: string, anchor?: string): string { return formatLinkTarget(`${dir.replace(/\/$/, "")}/_`, path, anchor); }
export function quoteMarkdown(item: Pick<Annotation, "page" | "quote"> & Partial<Pick<Annotation, "id">>, pdfTitle: string, pdfPath: string, baseDir: string): string {
  const title = pdfTitle.trim() || filename(pdfPath).replace(/\.pdf$/i, "");
  const anchor = `page=${item.page}${item.id ? `&annotation=${item.id}` : ""}`;
  return `> ${normalizeQuote(item.quote)}\n> — [${label(title)}, p. ${item.page}](${target(baseDir, pdfPath, anchor)})`;
}
export function exportMarkdown(list: Annotation[], options: ExportOptions, pdfTitle: string, pdfPath: string, noteDir: string): string {
  const title = pdfTitle.trim() || filename(pdfPath).replace(/\.pdf$/i, "");
  const lines = [`# Notes on ${title}`, "", `Source: [${label(filename(pdfPath))}](${target(noteDir, pdfPath)})`];
  const sorted = sortAnnotations(list); const seen = new Set<string>(); let lastPage = 0;
  for (const a of sorted) {
    if (a.group && seen.has(a.group)) continue;
    const parts = a.group ? sorted.filter((p) => p.group === a.group) : [a];
    if (a.group) seen.add(a.group);
    const pages = [...new Set(parts.map((p) => p.page))].sort((x, y) => x - y);
    const pageLabel = pages.length > 1 ? `${pages[0]} – ${pages[pages.length - 1]}` : `${a.page}`;
    if (options.groupByPage && lastPage !== a.page) { lines.push("", `## Page ${pageLabel}`); lastPage = a.page; }
    lines.push("");
    if (options.quotes) lines.push(`> ${parts.map((p) => p.quote).join(" ")}`);
    if (options.pageLinks) lines.push(`${options.quotes ? "> " : ""}— [p. ${pageLabel}](${target(noteDir, pdfPath, `page=${a.page}&annotation=${a.id}`)})`);
    if (options.comments) { const comments = parts.map((p) => p.comment).filter(Boolean); if (comments.length) lines.push("", ...comments); }
  }
  return lines.join("\n") + "\n";
}
export function rewriteQuoteLinks(text: string, fromDir: string, toDir: string): string {
  const links = noteLinks(text);
  for (const link of links.reverse()) {
    const [path, anchor] = link.target.split("#");
    if (!/\.pdf$/i.test(path) || !parsePdfAnchor(anchor || "").page) continue;
    const segments = `${fromDir}/${path}`.split("/"); const resolved: string[] = [];
    for (const part of segments) { if (part === "..") resolved.pop(); else if (part && part !== ".") resolved.push(part); }
    const absolute = `${fromDir.startsWith("/") ? "/" : ""}${resolved.join("/")}`;
    const replacement = target(toDir, absolute, anchor);
    const angled = text[link.start - 1] === "<" && text[link.end] === ">";
    text = text.slice(0, angled ? link.start - 1 : link.start) + replacement + text.slice(angled ? link.end + 1 : link.end);
  }
  return text;
}
