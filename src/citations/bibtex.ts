import type { Entry } from "./csl-json";

const accents: Record<string, string> = { "'": "\u0301", '`': "\u0300", '"': "\u0308", '^': "\u0302", '~': "\u0303", c: "\u0327", '=': "\u0304", '.': "\u0307", u: "\u0306", v: "\u030c", H: "\u030b" };
function clean(value: string): string {
  return value.replace(/\\(?:([\x27`"^~=\.])\s*\{?([a-zA-Z])\}?|([cuvH])(?![A-Za-z])\s*\{?([a-zA-Z])\}?)/g, (_, symbol: string, first: string, command: string, second: string) => ((first || second) + accents[symbol || command]).normalize("NFC"))
    .replace(/\\([A-Za-z]+)\s*\{\}/g, "$1")
    .replace(/\\[A-Za-z]+(?=\s*\{)/g, "")
    .replace(/\\[A-Za-z]+/g, "")
    .replace(/\\([&%_$#{}])/g, "$1").replace(/--/g, "–").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}
function people(value: string): { authors: string[]; authorsFull: string[] } {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "{") depth++; else if (value[i] === "}") depth--;
    if (!depth && /^\s+and\s+/i.test(value.slice(i))) {
      const sep = /^\s+and\s+/i.exec(value.slice(i))![0]; parts.push(value.slice(start, i)); i += sep.length - 1; start = i + 1;
    }
  }
  parts.push(value.slice(start));
  const authors: string[] = [], authorsFull: string[] = [];
  for (const part of parts) {
    const p = part.trim(); if (!p) continue;
    let family: string, full: string;
    if (p.startsWith("{") && p.endsWith("}")) { family = clean(p); full = family; }
    else if (p.includes(",")) { const [f, ...given] = p.split(","); family = clean(f); full = [family, clean(given.join(","))].filter(Boolean).join(", "); }
    else { const words = clean(p).split(" "); family = words.pop() ?? ""; full = [family, words.join(" ")].filter(Boolean).join(", "); }
    if (family) { authors.push(family); authorsFull.push(full); }
  }
  return { authors, authorsFull };
}

export function parseBibtex(text: string): Entry[] {
  let pos = 0; const macros = new Map<string, string>(), result: Entry[] = [], seen = new Set<string>();
  const ws = () => { while (/\s/.test(text[pos] ?? "") && pos < text.length) pos++; };
  const value = (): string => {
    const chunks: string[] = [];
    for (;;) {
      ws(); const start = pos;
      if (text[pos] === "{") {
        let depth = 1; pos++; const from = pos;
        while (pos < text.length && depth) { if (text[pos] === "\\") { pos += 2; continue; } if (text[pos] === "{") depth++; if (text[pos] === "}") depth--; pos++; }
        if (depth) throw new Error("Invalid bibliography"); chunks.push(text.slice(from, pos - 1));
      } else if (text[pos] === '"') {
        pos++; const from = pos; let depth = 0;
        while (pos < text.length) { if (text[pos] === "\\") { pos += 2; continue; } if (text[pos] === "{") depth++; if (text[pos] === "}") depth--; if (text[pos] === '"' && !depth) break; pos++; }
        if (pos >= text.length) throw new Error("Invalid bibliography"); chunks.push(text.slice(from, pos++));
      } else {
        while (pos < text.length && !/[\s,#})]/.test(text[pos])) pos++;
        if (pos === start) throw new Error("Invalid bibliography"); const word = text.slice(start, pos); chunks.push(macros.get(word.toLowerCase()) ?? word);
      }
      ws(); if (text[pos] !== "#") break; pos++;
    }
    return chunks.join("");
  };
  while (pos < text.length) {
    const at = text.indexOf("@", pos); if (at < 0) break; pos = at + 1;
    const type = /^[a-zA-Z]+/.exec(text.slice(pos))?.[0]?.toLowerCase(); if (!type) continue; pos += type.length; ws();
    const open = text[pos++]; if (open !== "{" && open !== "(") continue; const close = open === "{" ? "}" : ")";
    if (type === "comment" || type === "preamble") { let depth = 1; while (pos < text.length && depth) { if (text[pos] === open) depth++; else if (text[pos] === close) depth--; pos++; } continue; }
    try {
      ws(); let key = "";
      if (type !== "string") { const start = pos; while (pos < text.length && text[pos] !== "," && text[pos] !== close) pos++; if (text[pos] !== ",") throw new Error(); key = text.slice(start, pos++).trim(); }
      const fields = new Map<string, string>(); let closed = false;
      while (pos < text.length) {
        ws(); if (text[pos] === close) { pos++; closed = true; break; } if (text[pos] === ",") { pos++; continue; }
        const name = /^[\w-]+/.exec(text.slice(pos))?.[0]?.toLowerCase(); if (!name) throw new Error(); pos += name.length; ws(); if (text[pos++] !== "=") throw new Error(); fields.set(name, value()); ws();
        if (text[pos] !== "," && text[pos] !== close) throw new Error();
      }
      if (!closed) throw new Error();
      if (type === "string") { for (const [name, v] of fields) macros.set(name, v); continue; }
      if (!key || seen.has(key)) continue;
      if (result.length >= 20000) throw new Error("too many entries");
      const persons = people(fields.get("author") || fields.get("editor") || "");
      result.push({ key, type, ...persons, year: (fields.get("year") || fields.get("date") || "").match(/\d{4}/)?.[0] ?? "", title: clean(fields.get("title") || ""), container: clean(fields.get("journal") || fields.get("journaltitle") || fields.get("booktitle") || fields.get("publisher") || "") }); seen.add(key);
    } catch (error) { if (error instanceof Error && error.message === "too many entries") throw error; pos = Math.max(pos, at + 1); }
  }
  if (!result.length && text.trim()) throw new Error("Invalid bibliography");
  return result;
}
