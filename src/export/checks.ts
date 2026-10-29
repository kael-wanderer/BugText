import { dirOf, isRelativeImageSrc } from "../image-insert";
import { renderMarkdown } from "../preview";

/** Check the same relative image URLs that the preview resolves beside the note. */
export async function missingImages(markdown: string, notePath: string | null, stat: (path: string) => Promise<unknown>): Promise<string[]> {
  if (!notePath) return [];
  // Inert parse: listing images must not start loading them.
  const host = new DOMParser().parseFromString(renderMarkdown(markdown), "text/html").body;
  const missing: string[] = [];
  for (const image of Array.from(host.querySelectorAll("img"))) {
    const src = image.getAttribute("src") ?? "";
    if (!isRelativeImageSrc(src)) continue;
    let relative: string;
    try { relative = decodeURIComponent(src.split(/[?#]/)[0]); } catch { continue; }
    if (!relative || relative.split("/").includes("..")) continue;
    try { if (!(await stat(`${dirOf(notePath)}/${relative.replace(/^(\.\/)+/, "")}`))) missing.push(relative); }
    catch { missing.push(relative); }
  }
  return missing;
}
export function fontAvailable(font: string | null, fonts: string[]): boolean {
  return font === null || fonts.includes(font);
}
export function exportTitle(mode: "none" | "first-heading" | "file-name", heading: string, path: string | null): string {
  if (mode === "first-heading") return heading;
  if (mode === "file-name") return (path?.split(/[\\/]/).pop() ?? "").replace(/\.[^.]+$/, "");
  return "";
}
export function exportDate(mode: "none" | "export", date = new Date()): string {
  return mode === "export" ? date.toLocaleDateString() : "";
}
