/** One recipe run: resolve, confirm, stream, review, write, record. */
import type { Recipe, SavedAction } from "../ai/actions-store";
import { actionEngine } from "../ai/actions";
import type { AISettings, UseRow } from "../ai/aisettings";
import type { ContextSent } from "../ai/context-sent";
import { relativeContextPath } from "../ai/context-exclude";
import type { CliInfo } from "../ai/engines";
import type { ChatMessage } from "../ai/providers";
import type { PropertiesModule } from "../properties/loader";
import { resolveInputs, type InputContext, type LeftOut } from "./inputs";
import { generatedNote, propertiesReply } from "./output";
import { outputPath } from "./path";
import { recipeMessages } from "./prompt";
import { digests, recordRun, runKey } from "./runs";
import { currentOutput, writeOutput, type OutputDeps } from "./write";

export type RunPlan = {
  name: string; sources: { label: string; chars: number }[]; leftOut: LeftOut[]; trimmed: number; engine: string;
  output: { kind: "note"; relative: string; exists: boolean } | { kind: "chat" } | { kind: "properties"; relative: string };
};
export type RunUI = {
  confirm: (plan: RunPlan) => Promise<boolean>; // run sheet
  progress: (text: string, cancel: () => void) => void; // sheet shows Stop; Stop and Esc call cancel
  review: (args: { path: string; before: string; after: string }) => Promise<boolean>; // diff sheet
  done: (text: string) => void;
  fail: (text: string) => void;
};
export type RunDeps = Omit<InputContext, "recipeName" | "output"> & OutputDeps & {
  settings: () => AISettings; clis: () => CliInfo[]; props: PropertiesModule;
  stream: (row: UseRow, messages: ChatMessage[], onChunk: (t: string) => void, signal: AbortSignal) => Promise<void>;
  chat: (args: { title: string; summary: string; messages: ChatMessage[]; row: UseRow; context: ContextSent }) => Promise<boolean>; // true: a non-empty reply finished
  runs: { read(): Promise<string>; write(text: string): Promise<void> };
  engineLabel: (row: UseRow) => string;
  abort: () => AbortController;
};

export const NEEDS_FILES = "Add the reports to compare first.";

export async function runRecipe(action: SavedAction & { recipe: Recipe }, deps: RunDeps, ui: RunUI): Promise<void> {
  const { recipe } = action;
  const root = deps.folder.replace(/\/$/, "");
  if (recipe.inputs.some(i => i.kind === "files" && i.paths.length === 0)) return ui.fail(NEEDS_FILES);
  const usesCurrent = recipe.inputs.some(i => i.kind === "current-note");
  const relativeCurrent = usesCurrent && deps.current ? relativeContextPath(deps.current, deps.folder) : null;

  // 1. Where the result goes.
  let target: string | null = null; // absolute path of the note written, null for Chat
  let relative = "";
  if (recipe.output.kind === "note") {
    const path = outputPath(recipe.output.path, { now: deps.now, current: relativeCurrent });
    if ("error" in path) return ui.fail(path.error);
    relative = path.relative;
    target = `${root}/${relative}`;
  } else if (recipe.output.kind === "properties") {
    if (!deps.current) return ui.fail("Open a note to run this recipe.");
    target = deps.current;
    relative = relativeContextPath(deps.current, deps.folder);
  }

  // 2. What is sent.
  const resolved = resolveInputs(recipe, { ...deps, recipeName: action.name, output: recipe.output.kind === "note" ? target : null });
  if (resolved.error) return ui.fail(resolved.error);
  if (!resolved.sources.length) return ui.fail("Nothing to send: the recipe's inputs found no notes.");

  // 3. Who answers.
  const settings = deps.settings();
  const row = actionEngine({ ...action, engine: action.engine }, settings, deps.clis());
  if (row.engine.kind === "none") return ui.fail(`Choose an engine for ${action.name} in Settings ▸ AI ▸ ${action.engine ? "Actions" : "Use for"}.`);
  const built = recipeMessages({
    name: action.name, instruction: action.instruction, recipe, sources: resolved.sources,
    leftOut: resolved.leftOut, folder: deps.folder, cap: settings.maxContextChars,
  });

  // 4. Confirm.
  const before = target && recipe.output.kind !== "chat" ? await currentOutput(target, deps) : null;
  const output: RunPlan["output"] = recipe.output.kind === "chat" ? { kind: "chat" } :
    recipe.output.kind === "properties" ? { kind: "properties", relative } :
    { kind: "note", relative, exists: before?.kind !== "new" };
  const plan: RunPlan = {
    name: action.name, sources: resolved.sources.map(s => ({ label: s.label, chars: s.text.length })),
    leftOut: resolved.leftOut, trimmed: built.truncatedChars, engine: deps.engineLabel(row), output,
  };
  if (!await ui.confirm(plan)) return;
  const sourceDigests = digests(resolved.sources, deps.folder);
  const record = async (written: string | null) => {
    try {
      await recordRun(deps.runs, runKey(action.id, deps.folder), { at: deps.now.toISOString(), output: written, sources: sourceDigests });
    } catch { /* The output is already written; a lost digest only affects the "changed" count. */ }
  };

  // 5. Chat: the panel streams and shows the reply.
  if (recipe.output.kind === "chat") {
    const n = resolved.sources.filter(s => s.path !== null).length;
    const finished = await deps.chat({
      title: action.name, summary: `▸ ${action.name} · ${n} ${n === 1 ? "note" : "notes"}`,
      messages: built.messages, row, context: built.context,
    });
    if (!finished) return;
    await record(null);
    return ui.done("Sent to Chat");
  }

  // 6. Stream.
  const controller = deps.abort();
  ui.progress("Running…", () => controller.abort());
  let reply = "";
  try {
    await deps.stream(row, built.messages, chunk => { reply += chunk; }, controller.signal);
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
    return ui.fail(error instanceof Error ? error.message : String(error));
  }
  if (controller.signal.aborted) return;
  if (!reply.trim()) return ui.fail("The AI returned an empty reply.");

  // 7. The new text, 8. reviewed against the note as it is now, 9. written.
  const path = target!;
  const now = await currentOutput(path, deps);
  let next: string;
  if (recipe.output.kind === "properties") {
    if (now.kind === "new") return ui.fail("Save this note first.");
    const result = propertiesReply(reply, now.text, deps.props);
    if ("error" in result) return ui.fail(result.error);
    next = result.text;
  } else {
    const sourceRelatives = resolved.sources.filter(s => s.path !== null).map(s => relativeContextPath(s.path!, deps.folder));
    next = generatedNote(reply, { name: action.name, now: deps.now, outputRelative: relative, sourceRelatives }, deps.props);
  }
  if ((now.kind !== "new" || recipe.output.kind === "properties") && !await ui.review({ path, before: now.kind === "new" ? "" : now.text, after: next })) return;
  let written: string;
  try {
    written = (await writeOutput(path, next, now, deps)).path;
  } catch (error) {
    return ui.fail(error instanceof Error ? error.message : String(error));
  }

  // 10. Record, then report.
  const writtenRelative = relativeContextPath(written, deps.folder);
  await record(recipe.output.kind === "note" ? writtenRelative : null);
  ui.done(recipe.output.kind === "properties" ? `Updated the properties of ${writtenRelative}` : `Wrote ${writtenRelative}`);
}
