/** Resolves a recipe's inputs to the sources one run sends. Pure. */
import type { Recipe } from "../ai/actions-store";
import { matchesContextGlob, relativeContextPath } from "../ai/context-exclude";
import type { IndexedNote } from "../links/index";
import { lifecycleOf, localToday } from "../lifecycle/model";
import { evaluateSavedView, type SavedView } from "../saved-views/model";
import { noteTasks } from "../task-inbox/model";
import { completionDate } from "../tasks";

export type Source = { path: string | null; label: string; text: string }; // path absolute; null for the synthetic tasks source
export type LeftOut = { path: string; reason: "superseded" | "excluded" | "missing" | "limit" | "generated" };
export type InputContext = {
  folder: string; current: string | null; notes: IndexedNote[]; views: SavedView[];
  recipeName: string; output: string | null; // absolute path of a note output, else null
  textOf: (path: string) => string | null; // open tab text, else index source
  modifiedMs: (path: string) => number | null;
  isExcluded: (path: string) => boolean; includeSuperseded: boolean; now: Date;
};

export const SOURCE_LIMIT = 200;

/** The first day of "the last N days", as a local Date at midnight. */
function rangeStart(now: Date, days: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

export function resolveInputs(recipe: Recipe, ctx: InputContext): { sources: Source[]; leftOut: LeftOut[]; error?: string } {
  const root = ctx.folder.replace(/\/$/, "");
  const byPath = new Map(ctx.notes.map(n => [n.path, n]));
  const sorted = [...ctx.notes].sort((a, b) => a.path.localeCompare(b.path));
  const sources: Source[] = [];
  const leftOut: LeftOut[] = [];
  const seen = new Set<string>();
  const skip = (path: string, reason: LeftOut["reason"]) => leftOut.push({ path, reason });
  const superseded = (note: IndexedNote | undefined) => lifecycleOf(note?.properties ?? null).status === "superseded";
  const allowed = (note: IndexedNote) => !ctx.isExcluded(note.path) && (ctx.includeSuperseded || !superseded(note));

  // `named`: the note was chosen by name (a file list or the current note), so a note this recipe wrote still counts.
  function add(path: string, named: boolean) {
    if (seen.has(path)) return;
    seen.add(path);
    if (path === ctx.output) return; // never its own source
    const note = byPath.get(path);
    if (ctx.isExcluded(path)) return skip(path, "excluded");
    if (!ctx.includeSuperseded && superseded(note)) return skip(path, "superseded");
    if (!named && note?.properties?.generated_by === ctx.recipeName) return skip(path, "generated");
    const text = ctx.textOf(path);
    if (text === null) return skip(path, "missing");
    if (sources.length >= SOURCE_LIMIT) return skip(path, "limit");
    sources.push({ path, label: relativeContextPath(path, ctx.folder), text });
  }

  for (const input of recipe.inputs) {
    switch (input.kind) {
      case "current-note":
        if (!ctx.current) return { sources: [], leftOut: [], error: "Open a note to run this recipe." };
        add(ctx.current, true);
        break;
      case "files":
        for (const p of input.paths) add(`${root}/${p}`, true);
        break;
      case "glob": {
        const base = input.folder ? `${root}/${input.folder.replace(/\/$/, "")}` : root;
        for (const note of sorted)
          if (note.path.startsWith(base + "/") && matchesContextGlob(note.path.slice(base.length + 1), input.glob)) add(note.path, false);
        break;
      }
      case "view": {
        const view = ctx.views.find(v => v.id === input.viewId && v.folder.replace(/\/$/, "") === root);
        if (!view) return { sources: [], leftOut: [], error: "The saved view for this recipe no longer exists." };
        for (const note of evaluateSavedView(ctx.notes, view, ctx.now)) add(note.path, false);
        break;
      }
      case "changed": {
        const start = rangeStart(ctx.now, input.days).getTime();
        const recent = ctx.notes
          .map(note => ({ note, ms: ctx.modifiedMs(note.path) }))
          .filter((e): e is { note: IndexedNote; ms: number } => e.ms !== null && e.ms >= start)
          .sort((a, b) => b.ms - a.ms || a.note.path.localeCompare(b.note.path));
        for (const { note } of recent) add(note.path, false);
        break;
      }
      case "completed-tasks": {
        const label = `Completed tasks, last ${input.days} days`;
        if (sources.some(s => s.path === null && s.label === label)) break;
        const from = localToday(rangeStart(ctx.now, input.days));
        const to = localToday(ctx.now);
        const lines: { date: string; path: string; text: string }[] = [];
        for (const note of sorted) {
          if (!allowed(note)) continue;
          const sourceLines = note.source.split("\n");
          for (const task of noteTasks(note)) {
            if (!task.checked) continue;
            const line = sourceLines[task.line - 1].trim();
            const date = completionDate(line);
            if (date && date >= from && date <= to) lines.push({ date, path: note.path, text: `${line} — ${relativeContextPath(note.path, ctx.folder)}` });
          }
        }
        if (!lines.length) break;
        lines.sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path));
        sources.push({ path: null, label, text: lines.map(l => l.text).join("\n") });
        break;
      }
    }
  }
  return { sources, leftOut };
}
