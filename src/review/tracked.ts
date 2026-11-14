import { isContextExcluded } from "../ai/context-exclude";

const TRACKED = /\.(md|markdown|html|htm)$/i;

/** The folder-relative files the review queue tracks. */
export function trackedFiles(files: readonly string[], folder: string, exclude: readonly string[]): string[] {
  return files.filter(path =>
    TRACKED.test(path)
    && !path.replace(/\\/g, "/").split("/").some(part => part.startsWith("."))
    && !isContextExcluded(path, folder, exclude));
}

/** `path` relative to `folder`, or null when it lies outside it. Relative input is kept. */
export function relativeTo(folder: string, path: string): string | null {
  const clean = path.replace(/\\/g, "/");
  const root = folder.replace(/\\/g, "/").replace(/\/$/, "");
  if (!clean.startsWith("/") && !/^[A-Za-z]:\//.test(clean)) return clean;
  return clean.startsWith(root + "/") ? clean.slice(root.length + 1) : null;
}
