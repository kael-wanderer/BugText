export type Entry = { key: string; type: string; authors: string[]; authorsFull: string[]; year: string; title: string; container: string };
export type CitationStyle = "chicago" | "apa" | "ieee";
export type Library = { path: string; entries: Map<string, Entry> };
export type LibraryResult = { status: "none" } | { status: "error" } | { status: "ok"; library: Library };

export function parseCslJson(text: string): Entry[] {
  const data: unknown = JSON.parse(text);
  const items = Array.isArray(data) ? data : (data && typeof data === "object" ? (data as Record<string, unknown>).items : null);
  if (!Array.isArray(items) || items.length > 20000) throw new Error("Invalid bibliography");
  const result: Entry[] = [], seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || seen.has(item.id)) continue;
    const people = Array.isArray(item.author) && item.author.length ? item.author : Array.isArray(item.editor) ? item.editor : [];
    const authors: string[] = [], authorsFull: string[] = [];
    for (const person of people) {
      if (!person || typeof person !== "object") continue;
      const family = typeof person.literal === "string" ? person.literal : typeof person.family === "string" ? person.family : "";
      if (!family) continue;
      authors.push(family);
      authorsFull.push(typeof person.given === "string" && person.given ? `${family}, ${person.given}` : family);
    }
    const date = item.issued?.["date-parts"]?.[0]?.[0] ?? item.issued?.raw ?? "";
    const year = String(date).match(/\d{4}/)?.[0] ?? "";
    const string = (v: unknown) => typeof v === "string" ? v : "";
    result.push({ key: item.id, type: string(item.type), authors, authorsFull, year, title: string(item.title), container: string(item["container-title"]) || string(item.publisher) });
    seen.add(item.id);
  }
  return result;
}
