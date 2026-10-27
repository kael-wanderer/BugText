// Pure helpers for images pasted or dropped into Markdown notes.

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"] as const;
const MAX_FOLDER_CHARS = 64;

export function isImagePath(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return (IMAGE_EXTENSIONS as readonly string[]).includes(name.slice(dot + 1).toLowerCase());
}

/** `.` or one or two plain segments; mirrors the check in `assets.rs`. */
export function validImageFolder(folder: string): boolean {
  if (folder === ".") return true;
  if (!folder || [...folder].length > MAX_FOLDER_CHARS) return false;
  if (folder.startsWith("/") || folder.includes("\\")) return false;
  const segments = folder.split("/");
  if (segments.length > 2) return false;
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Link text safe inside `(...)`: spaces and parentheses are percent-encoded. */
export function encodeLink(link: string): string {
  return link.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

export function imageMarkdown(alt: string, link: string): string {
  const safeAlt = alt.replace(/[[\]\\]/g, (c) => `\\${c}`).replace(/\s+/g, " ");
  return `![${safeAlt}](${encodeLink(link)})`;
}

/** Alt text for a dropped file: its name without extension. */
export function altFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export type PasteNameStyle = "note" | "image";

/** Stem for a pasted image: `<note>-<YYYYMMDD-HHMMSS>` or `image-<…>`. */
export function pastedImageStem(notePath: string, style: PasteNameStyle, date: Date): string {
  const name = notePath.slice(notePath.lastIndexOf("/") + 1);
  const stem = altFromName(name).trim();
  const base = style === "note" && stem ? stem : "image";
  return `${base}-${stamp(date)}`;
}

/** Text for the "Added … to …/" toast. */
export function folderLabel(folder: string): string {
  return folder === "." ? "the note's folder" : `${folder}/`;
}

/** True for a src that names a file relative to the note (not a URL, not absolute). */
export function isRelativeImageSrc(src: string): boolean {
  if (!src || src.startsWith("/") || src.startsWith("#") || src.startsWith("//")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(src);
}

function decodeLink(link: string): string {
  try {
    return decodeURIComponent(link);
  } catch {
    return link;
  }
}

/**
 * Relative local image paths a note references, decoded and without `./`,
 * skipping anything that climbs out of the note's folder. Used by Save As.
 */
export function localImageLinks(markdown: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    const link = raw.trim().replace(/^<|>$/g, "").split(/[?#]/)[0];
    if (!isRelativeImageSrc(link)) return;
    const path = decodeLink(link).replace(/^(\.\/)+/, "");
    if (!path || path.split("/").includes("..") || !isImagePath(path)) return;
    found.add(path);
  };
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) add(match[1]);
  for (const match of markdown.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  return [...found];
}

/** Folder of an absolute path, without the trailing slash. */
export function dirOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}
