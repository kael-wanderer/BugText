import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { quoteMarkdown, rewriteQuoteLinks, type Annotation } from "./model";
let last: { text: string; path: string; baseDir: string } | null = null;
export async function copyQuote(item: Pick<Annotation, "page" | "quote"> & Partial<Pick<Annotation, "id">>, title: string, path: string, baseDir: string): Promise<string> {
  const text = quoteMarkdown(item, title, path, baseDir);
  await writeText(text); last = { text, path, baseDir }; return text;
}
export function rewriteLastQuote(text: string, noteDir: string): string | null {
  return last && text === last.text ? rewriteQuoteLinks(text, last.baseDir, noteDir) : null;
}
