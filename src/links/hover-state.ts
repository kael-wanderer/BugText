import type { LinkIndex } from "./index";
import { resolveLink } from "./resolve";
import { noteExcerpt, type Excerpt } from "./hover-excerpt";
export type CardState =
  | { kind: "excerpt"; title: string; relative: string; excerpt: Excerpt }
  | { kind: "missing"; title: string; relative: string }
  | { kind: "unavailable"; title: string; relative: string }
  | { kind: "heading-missing"; title: string; relative: string; heading: string; excerpt: Excerpt }
  | { kind: "indexing" };
export function cardStateForPath(index: LinkIndex, path: string, anchor?: string): CardState | null {
  if (!index.folder) return null;
  const folder = index.folder.replace(/\/$/, "") || "/";
  const prefix = folder === "/" ? "/" : folder + "/";
  if (!path.startsWith(prefix) || path.slice(prefix.length).split("/").includes("..") || !/\.(md|markdown)$/i.test(path)) return null;
  if (!index.ready) return { kind: "indexing" };
  const relative = path.slice(prefix.length), title = relative.split("/").pop()!.replace(/\.(md|markdown)$/i, "");
  if (index.skipped.includes(path)) return { kind: "unavailable", title, relative };
  const source = index.savedSource(path); if (source === undefined) return { kind: "missing", title, relative };
  const excerpt = noteExcerpt(source, anchor);
  return anchor && !excerpt.headingFound ? { kind: "heading-missing", title, relative, heading: anchor, excerpt } : { kind: "excerpt", title, relative, excerpt };
}
export function cardStateForTarget(index: LinkIndex, target: string, fromPath: string): CardState | null {
  if (!index.folder) return null;
  const resolved = resolveLink(target, fromPath, index.folder);
  return resolved.kind === "note" && resolved.path ? cardStateForPath(index, resolved.path, resolved.anchor) : null;
}
