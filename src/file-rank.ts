// Ranks folder files for the palette by how a person types or pastes a path.
// Tiers: exact path, exact file name, name prefix, fuzzy name, fuzzy path.

export type FileQuery = { query: string; line: number | null };

export type RankedFile = {
  path: string;
  exact: boolean;
  /** Indices into the file name (the last path segment) to highlight. */
  hits: number[];
};

/** Strips what a pasted path carries beyond the folder-relative path: `./`, the folder itself, `:line`. */
export function cleanFileQuery(raw: string, folder: string | null): FileQuery {
  let query = raw.trim().replace(/^["'`]|["'`]$/g, "").replace(/\\/g, "/");
  let line: number | null = null;
  const lineMatch = /:(\d+)(?::\d+)?$/.exec(query);
  if (lineMatch) {
    line = Number(lineMatch[1]) || null;
    query = query.slice(0, lineMatch.index);
  }
  const root = folder?.replace(/\\/g, "/").replace(/\/+$/, "");
  if (root && query.toLowerCase().startsWith(`${root.toLowerCase()}/`)) query = query.slice(root.length + 1);
  query = query.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  return { query, line };
}

function fileName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? path : path.slice(slash + 1);
}

/** Subsequence match ignoring spaces in the query; rewards runs and word starts. */
function fuzzy(query: string, text: string): { score: number; hits: number[] } | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return { score: 0, hits: [] };
  const t = text.toLowerCase();
  const hits: number[] = [];
  let score = 0;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    score += hits.length && hits[hits.length - 1] === ti - 1 ? 3 : 1;
    if (ti === 0 || /[/\\ _.\-]/.test(t[ti - 1])) score += 2;
    hits.push(ti);
    qi++;
  }
  return qi < q.length ? null : { score: score - t.length * 0.01, hits };
}

const range = (from: number, length: number): number[] => Array.from({ length }, (_, i) => from + i);

export function rankFiles(query: string, paths: readonly string[]): RankedFile[] {
  if (!query) return paths.map(path => ({ path, exact: false, hits: [] }));
  const lower = query.toLowerCase();
  const scored: { file: RankedFile; tier: number; score: number }[] = [];
  for (const path of paths) {
    const name = fileName(path);
    const nameLower = name.toLowerCase();
    if (path.toLowerCase() === lower) {
      scored.push({ file: { path, exact: true, hits: range(0, name.length) }, tier: 0, score: 0 });
    } else if (nameLower === lower) {
      scored.push({ file: { path, exact: false, hits: range(0, name.length) }, tier: 1, score: 0 });
    } else if (nameLower.startsWith(lower)) {
      scored.push({ file: { path, exact: false, hits: range(0, lower.length) }, tier: 2, score: -name.length });
    } else {
      const byName = fuzzy(query, name);
      if (byName) {
        scored.push({ file: { path, exact: false, hits: byName.hits }, tier: 3, score: byName.score });
        continue;
      }
      const byPath = fuzzy(query, path);
      if (!byPath) continue;
      const nameStart = path.length - name.length;
      const hits = byPath.hits.filter(i => i >= nameStart).map(i => i - nameStart);
      scored.push({ file: { path, exact: false, hits }, tier: 4, score: byPath.score });
    }
  }
  scored.sort((a, b) => a.tier - b.tier || b.score - a.score || a.file.path.localeCompare(b.file.path));
  return scored.map(entry => entry.file);
}
