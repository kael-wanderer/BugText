import { isMap, isScalar, parseDocument, stringify } from "yaml";
import { findFrontMatter, readProperties } from "./parse";

export type PropertyEdit = { from: number; to: number; insert: string };

function validKey(key: string): boolean {
  return key.trim() === key && !!key && !/[\r\n]/.test(key) && !key.startsWith(":");
}
function validValue(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (Array.isArray(value) && value.every(v => typeof v === "string"));
}
function encoded(value: unknown): string {
  return stringify(value, { lineWidth: 0, collectionStyle: "flow" }).trimEnd();
}
function parse(source: string) {
  const front = findFrontMatter(source);
  const result = readProperties(source);
  if (!front || !result?.ok) return null;
  const options = { maxAliasCount: 0, uniqueKeys: true };
  const doc = parseDocument(front.block, options);
  if (doc.errors.length || doc.warnings.length || (doc.contents && !isMap(doc.contents))) return null;
  const blockStart = source.indexOf("\n") + 1;
  return { front, doc, blockStart };
}

function verified(source: string, edit: PropertyEdit, key: string, value: unknown): PropertyEdit | null {
  const next = source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
  const result = readProperties(next);
  if (!result?.ok || !Object.prototype.hasOwnProperty.call(result.props, key)) return null;
  return JSON.stringify(result.props[key]) === JSON.stringify(value) ? edit : null;
}

export function setProperty(source: string, key: string, value: unknown): PropertyEdit | null {
  if (!validKey(key) || !validValue(value)) return null;
  const front = findFrontMatter(source);
  if (!front) {
    // An unfinished opening delimiter is not an empty document.
    if (/^---[ \t]*\r?(?:\n|$)/.test(source)) return null;
    return verified(source, { from: 0, to: 0, insert: `---\n${encoded(key)}: ${encoded(value)}\n---\n` }, key, value);
  }
  const parsed = parse(source);
  if (!parsed) return null;
  const { doc, blockStart } = parsed;
  const pair = isMap(doc.contents) ? doc.contents.items.find(p => isScalar(p.key) && p.key.value === key) : undefined;
  if (!pair) {
    const newline = source.startsWith("---\r\n") ? "\r\n" : "\n";
    const end = blockStart + front.block.length;
    const prefix = front.block && !front.block.endsWith("\n") ? newline : "";
    return verified(source, { from: end, to: end, insert: `${prefix}${encoded(key)}: ${encoded(value)}${newline}` }, key, value);
  }
  const node = pair.value;
  if (!node || !('range' in node) || !node.range) return null;
  const [start, end] = node.range;
  const old = front.block.slice(start, end);
  // Do not discard comments within a multiline value.
  if (old.includes("\n") && /(^|\s)#/.test(old)) return null;
  const suffix = old.endsWith("\n") ? (old.endsWith("\r\n") ? "\r\n" : "\n") : "";
  const spacing = start === end && front.block[start - 1] === ":" ? " " : "";
  return verified(source, { from: blockStart + start, to: blockStart + end, insert: spacing + encoded(value) + suffix }, key, value);
}

export function removeProperty(source: string, key: string): PropertyEdit | null {
  if (!validKey(key)) return null;
  const parsed = parse(source);
  if (!parsed || !isMap(parsed.doc.contents)) return null;
  const { front, doc, blockStart } = parsed;
  const map = doc.contents;
  if (!isMap(map)) return null;
  const pair = map.items.find(p => isScalar(p.key) && p.key.value === key);
  if (!pair || !isScalar(pair.key) || !pair.key.range) return null;
  const start = front.block.lastIndexOf("\n", pair.key.range[0] - 1) + 1;
  const node = pair.value;
  const endOffset = node && 'range' in node && node.range ? node.range[2] : pair.key.range[2];
  let end = endOffset;
  if (end < front.block.length && front.block[end - 1] !== "\n") {
    const next = front.block.indexOf("\n", end);
    end = next < 0 ? front.block.length : next + 1;
  }
  // A removed row must not silently discard comments.
  if (/(^|\s)#/.test(front.block.slice(start, end))) return null;
  if (map.items.length === 1 && !/#/.test(front.block)) return { from: front.start, to: front.end, insert: "" };
  return { from: blockStart + start, to: blockStart + end, insert: "" };
}
