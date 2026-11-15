/** Run digests per recipe and folder (`recipe-runs.json`), for "sources changed since last run". */
import { relativeContextPath } from "../ai/context-exclude";
import { hashText } from "../hash";
import type { Source } from "./inputs";

export type RunRecord = { at: string; output: string | null; sources: Record<string, string> };
export type RunsIO = { read(): Promise<string>; write(text: string): Promise<void> };

export function runKey(recipeId: string, folder: string): string {
  return `${recipeId}\n${folder}`;
}

function validRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return typeof r.at === "string" && (r.output === null || typeof r.output === "string") &&
    !!r.sources && typeof r.sources === "object" && !Array.isArray(r.sources) &&
    Object.values(r.sources).every(v => typeof v === "string");
}

/** The records of a runs file; a bad file or record reads as none. */
export function parseRuns(text: string): Record<string, RunRecord> {
  try {
    const file: unknown = JSON.parse(text);
    const runs = (file as { runs?: unknown } | null)?.runs;
    if (!runs || typeof runs !== "object" || Array.isArray(runs)) return {};
    return Object.fromEntries(Object.entries(runs).filter(([, r]) => validRecord(r))) as Record<string, RunRecord>;
  } catch { return {}; }
}

/** Sources whose digest differs or that are new, plus last-run sources that are gone. */
export function changedSources(last: RunRecord | undefined, now: Record<string, string>): number {
  const before = last?.sources ?? {};
  let count = 0;
  for (const [path, digest] of Object.entries(now)) if (before[path] !== digest) count++;
  for (const path of Object.keys(before)) if (!(path in now)) count++;
  return count;
}

export function digests(sources: Source[], folder: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of sources) if (source.path !== null) out[relativeContextPath(source.path, folder)] = hashText(source.text);
  return out;
}

export async function recordRun(io: RunsIO, key: string, record: RunRecord): Promise<void> {
  const runs = parseRuns(await io.read());
  runs[key] = record;
  await io.write(JSON.stringify({ version: 1, runs }));
}
