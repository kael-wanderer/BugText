// The text of an imported note: a front matter block whose values are JSON
// strings (valid YAML double-quoted scalars, so no value can end the block),
// then the converted body. Plus the default name, the default save path, and the
// "already imported" lookup over the link index.

import type { IndexedNote } from "../links/index";

export type ImportMeta = { source: string; importedAt: string; digest: string; title?: string };

const MAX_NAME = 80;
const FALLBACK_NAME = "Imported page";

export function importedNote(body: string, meta: ImportMeta): string {
  const lines = ["---"];
  if (meta.title) lines.push(`title: ${JSON.stringify(meta.title)}`);
  lines.push(`source: ${JSON.stringify(meta.source)}`);
  lines.push(`imported_at: ${JSON.stringify(meta.importedAt)}`);
  lines.push(`source_digest: ${JSON.stringify(meta.digest)}`);
  lines.push("---", "", "");
  return lines.join("\n") + body;
}

/** A safe file stem: no control characters, path or shell-reserved characters, or leading dots. */
export function nameFrom(text: string): string {
  const cleaned = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, "");
  const cut = Array.from(cleaned).slice(0, MAX_NAME).join("").trim();
  return cut || FALLBACK_NAME;
}

export function defaultSavePath(activeRelative: string | null, name: string): string {
  const slash = activeRelative ? activeRelative.lastIndexOf("/") : -1;
  const dir = slash >= 0 ? activeRelative!.slice(0, slash + 1) : "";
  return `${dir}${name}.md`;
}

export function earlierImport(
  notes: IndexedNote[],
  folder: string,
  match: { source?: string; digest?: string },
): { path: string; importedAt: string | null } | null {
  const root = `${folder.replace(/\/+$/, "")}/`;
  const { source, digest } = match;
  if (!source && !digest) return null;
  for (const note of notes) {
    if (!note.path.startsWith(root) || !note.properties) continue;
    const props = note.properties;
    const hit = (source && props.source === source) || (digest && props.source_digest === digest);
    if (hit) return { path: note.path, importedAt: typeof props.imported_at === "string" ? props.imported_at : null };
  }
  return null;
}
