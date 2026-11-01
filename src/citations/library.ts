import { readProperties } from "../properties/parse";
import { parentPath } from "../paths";
import type { Library, LibraryResult } from "./csl-json";

export type LibraryDeps = { stat(path: string): Promise<{ mtimeMs: number; size: number } | null>; read(path: string, folder: string): Promise<string> };
const cache = new Map<string, { mtimeMs: number; size: number; at: number; library: Library }>();
const limit = 5 * 1024 * 1024;
function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop(); else parts.push(part);
  }
  return `/${parts.join("/")}`;
}
export async function libraryFor(notePath: string | null, text: string, folder: string | null, deps: LibraryDeps): Promise<LibraryResult> {
  if (!folder || !notePath || !notePath.startsWith("/")) return { status: "none" };
  const root = normalize(folder); const props = readProperties(text);
  const raw = props?.ok ? props.props.bibliography : undefined;
  const property = Array.isArray(raw) ? raw.find(v => typeof v === "string") : raw;
  const explicit = raw !== undefined;
  if (explicit && (typeof property !== "string" || !property.trim() || /^(?:[\\/~]|[A-Za-z]:)/.test(property) || !/\.(?:bib|json)$/i.test(property))) return { status: "error" };
  const paths = explicit ? [normalize(`${parentPath(notePath)}/${property as string}`)] : [`${root === "/" ? "" : root}/references.bib`, `${root === "/" ? "" : root}/references.json`];
  for (const path of paths) {
    if (!(root === "/" ? path.startsWith("/") : path.startsWith(`${root}/`))) return { status: "error" };
    const cached = cache.get(path); const now = Date.now();
    if (cached && now - cached.at < 3000) return { status: "ok", library: cached.library };
    try {
      const stat = await deps.stat(path);
      if (!stat) { cache.delete(path); if (explicit) return { status: "error" }; continue; }
      if (stat.size > limit) return { status: "error" };
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) { cached.at = now; return { status: "ok", library: cached.library }; }
      const contents = await deps.read(path, folder);
      if (new TextEncoder().encode(contents).length > limit) return { status: "error" };
      const entries = /\.bib$/i.test(path) ? (await import("./bibtex")).parseBibtex(contents) : (await import("./csl-json")).parseCslJson(contents);
      const library = { path, entries: new Map(entries.map(entry => [entry.key, entry])) };
      cache.set(path, { ...stat, at: now, library });
      return { status: "ok", library };
    } catch { if (explicit) return { status: "error" }; return { status: "error" }; }
  }
  return { status: "none" };
}
