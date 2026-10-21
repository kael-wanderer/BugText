export type Chunk = { path: string; heading: string; text: string };

export type RetrievalIndex = {
  chunks: Chunk[];
  tf: Map<string, number>[];
  lengths: number[];
  avgLength: number;
  df: Map<string, number>;
  n: number;
};

const HEADING_RE = /^#{1,6}\s+(.*)$/;
const K1 = 1.5;
const B = 0.75;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function splitToSize(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed ? [trimmed] : [];
  const parts: string[] = [];
  let current = "";
  for (const para of trimmed.split(/\n{2,}/)) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) parts.push(current);
    if (para.length <= maxChars) {
      current = para;
    } else {
      for (let i = 0; i < para.length; i += maxChars) {
        parts.push(para.slice(i, i + maxChars));
      }
      current = "";
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function chunkDocument(
  path: string,
  text: string,
  maxChars = 1500,
): Chunk[] {
  const sections: { heading: string; lines: string[] }[] = [
    { heading: "", lines: [] },
  ];
  for (const line of text.split("\n")) {
    const match = HEADING_RE.exec(line);
    if (match) {
      sections.push({ heading: match[1].trim(), lines: [] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const body = section.lines.join("\n");
    for (const piece of splitToSize(body, maxChars)) {
      chunks.push({ path, heading: section.heading, text: piece });
    }
  }
  return chunks;
}

export function buildIndex(chunks: Chunk[]): RetrievalIndex {
  const tf: Map<string, number>[] = [];
  const lengths: number[] = [];
  const df = new Map<string, number>();

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    tf.push(counts);
    lengths.push(tokens.length);
    for (const term of counts.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const total = lengths.reduce((sum, length) => sum + length, 0);
  return {
    chunks,
    tf,
    lengths,
    avgLength: chunks.length ? total / chunks.length : 0,
    df,
    n: chunks.length,
  };
}

export function retrieveScored(
  index: RetrievalIndex,
  query: string,
  k: number,
  excludePath?: string,
): { chunk: Chunk; score: number }[] {
  if (index.n === 0) return [];
  const terms = tokenize(query);
  const scored: { i: number; score: number }[] = [];

  for (let i = 0; i < index.n; i += 1) {
    if (excludePath && index.chunks[i].path === excludePath) continue;
    const counts = index.tf[i];
    const len = index.lengths[i];
    let score = 0;
    for (const term of terms) {
      const f = counts.get(term);
      if (!f) continue;
      const nq = index.df.get(term) ?? 0;
      const idf = Math.log(1 + (index.n - nq + 0.5) / (nq + 0.5));
      const denom = f + K1 * (1 - B + (B * len) / (index.avgLength || 1));
      score += idf * ((f * (K1 + 1)) / denom);
    }
    if (score > 0) scored.push({ i, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, k)).map((hit) => ({ chunk: index.chunks[hit.i], score: hit.score }));
}

export function retrieve(
  index: RetrievalIndex,
  query: string,
  k: number,
  excludePath?: string,
): Chunk[] {
  return retrieveScored(index, query, k, excludePath).map((hit) => hit.chunk);
}
