import { cleanFileQuery, rankFiles, type RankedFile } from "./file-rank";

export type FileMatches = { query: string; rows: RankedFile[]; total: number };

/** Files whose name matches a Search panel query, for the Files group above content hits. */
export function searchFileMatches(raw: string, files: readonly string[], folder: string | null, limit = 5): FileMatches {
  const { query } = cleanFileQuery(raw, folder);
  if (!query) return { query, rows: [], total: 0 };
  const named = rankFiles(query, files).filter(file => file.byName);
  return { query, rows: named.slice(0, limit), total: named.length };
}

/** A query that reads as a path to one file: has a folder separator or ends in an extension. */
export function looksLikePath(query: string): boolean {
  return /[\\/]/.test(query) || /\.[A-Za-z0-9]{1,8}$/.test(query);
}
