import { invoke } from "@tauri-apps/api/core";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { SearchHit, SearchOptions } from "./filesys";
import { firstSearchMatch } from "./search-match";

export async function searchPdf(
  path: string,
  relative: string,
  query: string,
  options: SearchOptions,
  isCurrent: () => boolean = () => true,
): Promise<SearchHit[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  let task: ReturnType<typeof pdfjs.getDocument> | undefined;
  try {
  const bytes = await invoke<number[]>("read_file_bytes", { path });
  task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await task.promise;
  const hits: SearchHit[] = [];
  for (let page = 1; page <= pdf.numPages && hits.length < 50; page += 1) {
    if (!isCurrent()) break;
    const content = await (await pdf.getPage(page)).getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const match = firstSearchMatch(text, query, options);
    if (!match) continue;
    const from = Math.max(0, match.start - 70);
    const to = Math.min(text.length, match.end + 130);
    const snippet = text.slice(from, to);
    hits.push({
      path,
      relative,
      page,
      line: page,
      snippet,
      match_start: match.start - from,
      match_end: match.end - from,
    });
  }
  return hits;
  } catch {
    throw new Error("PDF could not be opened");
  } finally {
    await task?.destroy();
  }
}
