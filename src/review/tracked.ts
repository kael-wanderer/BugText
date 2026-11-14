import { isContextExcluded } from "../ai/context-exclude";

const TRACKED = /\.(md|markdown|html|htm)$/i;

/** Splits a folder listing into the files the review queue tracks and the tracked-type
 * files the owner excluded from AI context (Rust drops their records). */
export function trackedFiles(files: readonly string[], folder: string, exclude: readonly string[]): { tracked: string[]; excluded: string[] } {
  const tracked: string[] = [], excluded: string[] = [];
  for (const path of files) {
    if (!TRACKED.test(path) || path.replace(/\\/g, "/").split("/").some(part => part.startsWith("."))) continue;
    (isContextExcluded(path, folder, exclude) ? excluded : tracked).push(path);
  }
  return { tracked, excluded };
}

/** `path` relative to `folder`, or null when it lies outside it. Relative input is kept. */
export function relativeTo(folder: string, path: string): string | null {
  const clean = path.replace(/\\/g, "/");
  const root = folder.replace(/\\/g, "/").replace(/\/$/, "");
  if (!clean.startsWith("/") && !/^[A-Za-z]:\//.test(clean)) return clean;
  return clean.startsWith(root + "/") ? clean.slice(root.length + 1) : null;
}
