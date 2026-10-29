import { isMap, parseDocument } from "yaml";
import { findFrontMatter, type FrontMatter } from "./frontmatter";

export { findFrontMatter, type FrontMatter };

export type PropertyKind = "text" | "list" | "date" | "number" | "checkbox";
export type ReadResult = { ok: true; props: Record<string, unknown> } | { ok: false; error: string; line: number };

export function propertyKind(value: unknown): PropertyKind {
  if (Array.isArray(value)) return "list";
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  return "text";
}

export function readProperties(source: string): ReadResult | null {
  const front = findFrontMatter(source);
  if (!front) return null;
  const options = { maxAliasCount: 0, uniqueKeys: true };
  const doc = parseDocument(front.block, options);
  if (doc.errors.length || doc.warnings.length) {
    const offset = (doc.errors[0] ?? doc.warnings[0]).pos[0];
    const line = 2 + (front.block.slice(0, offset).match(/\n/g)?.length ?? 0);
    return { ok: false, error: "Invalid YAML properties", line };
  }
  if (!isMap(doc.contents) && doc.contents !== null) return { ok: false, error: "Properties must be a list of keys", line: 1 };
  try {
    const props = doc.toJS({ maxAliasCount: 0 });
    return { ok: true, props: props ?? {} };
  } catch {
    return { ok: false, error: "Invalid YAML properties", line: 1 };
  }
}
