import { loadProperties } from "../properties/loader";
const props = await loadProperties();
import { describe, expect, it, vi } from "vitest";
import { parseNote } from "../links/index";
import { DEFAULT_AI_SETTINGS, type UseRow } from "../ai/aisettings";
import type { Recipe, SavedAction } from "../ai/actions-store";
import { runRecipe, type RunDeps, type RunPlan, type RunUI } from "../recipes/run";
import { parseRuns } from "../recipes/runs";

const now = new Date(2026, 10, 12, 9, 5);
const api: UseRow = { engine: { kind: "api", connectionId: "c1" }, model: "m", effort: "" };
const weekly: Recipe = { inputs: [{ kind: "changed", days: 7 }, { kind: "completed-tasks", days: 7 }], output: { kind: "note", path: "Reviews/{{year}}-W{{week}}.md" } };
const action = (recipe: Recipe, over: Partial<SavedAction> = {}) =>
  ({ id: "r1", name: "Weekly review", instruction: "Review my week.", result: "answer", input: "note", engine: api, panel: false, recipe, ...over }) as SavedAction & { recipe: Recipe };

function setup(over: Partial<RunDeps> = {}, disk: Record<string, string> = {}) {
  const files: Record<string, string> = { "/r/a.md": "alpha", "/r/tasks.md": "- [x] ship ✅ 2026-11-10", ...disk };
  let runsText = "{}";
  let reply = "# Week\nbody";
  const signals: AbortSignal[] = [];
  const d: RunDeps = {
    folder: "/r", current: null, views: [],
    notes: Object.entries(files).map(([p, t]) => parseNote(p, t)),
    textOf: p => files[p] ?? null,
    modifiedMs: p => (p === "/r/a.md" || p === "/r/tasks.md") ? now.getTime() - 3600_000 : null,
    isExcluded: () => false, includeSuperseded: false, now,
    folderNow: () => "/r",
    findOpen: () => null,
    read: vi.fn(async (p: string) => { if (p in files) return files[p]; throw new Error("missing"); }),
    changed: vi.fn(),
    snapshot: vi.fn(async () => {}),
    write: vi.fn(async (p: string, c: string) => { files[p] = c; }),
    create: vi.fn(async (a: { folder: string; relativeDir: string; stem: string; contents: string }) => `/r/${a.relativeDir}/${a.stem}.md`),
    settings: () => DEFAULT_AI_SETTINGS, clis: () => [], props,
    stream: vi.fn(async (_row, _messages, onChunk, signal: AbortSignal) => { signals.push(signal); onChunk(reply); }),
    chat: vi.fn(async () => true),
    runs: { read: async () => runsText, write: vi.fn(async (t: string) => { runsText = t; }) },
    engineLabel: () => "omlx · m",
    abort: () => new AbortController(),
    ...over,
  };
  const ui = {
    confirm: vi.fn(async (_plan: RunPlan) => true),
    progress: vi.fn((_text: string, _cancel: () => void) => {}),
    review: vi.fn(async (_args: { path: string; before: string; after: string }) => true),
    done: vi.fn((_t: string) => {}), fail: vi.fn((_t: string) => {}),
  } satisfies RunUI;
  return { d, ui, files, runs: () => parseRuns(runsText), setReply: (r: string) => { reply = r; }, signals };
}

describe("runRecipe", () => {
  it("writes a new output note and records the run", async () => {
    const { d, ui, runs } = setup();
    await runRecipe(action(weekly), d, ui);
    expect(ui.confirm.mock.calls[0][0].output).toEqual({ kind: "note", relative: "Reviews/2026-W46.md", exists: false });
    expect(ui.confirm.mock.calls[0][0].engine).toBe("omlx · m");
    expect(d.stream).toHaveBeenCalledOnce();
    expect(ui.review).not.toHaveBeenCalled();
    const created = vi.mocked(d.create).mock.calls[0][0];
    expect(created).toMatchObject({ folder: "/r", relativeDir: "Reviews", stem: "2026-W46" });
    expect(created.contents).toContain("generated_by: Weekly review");
    const record = runs()["r1\n/r"];
    expect(Object.keys(record.sources).sort()).toEqual(["a.md", "tasks.md"]);
    expect(record.output).toBe("Reviews/2026-W46.md");
    expect(ui.done).toHaveBeenCalledWith("Wrote Reviews/2026-W46.md");
  });

  it("shows a diff for an existing output note", async () => {
    const { d, ui, runs } = setup({}, { "/r/Reviews/2026-W46.md": "old review" });
    ui.review.mockResolvedValueOnce(false);
    await runRecipe(action(weekly), d, ui);
    expect(ui.confirm.mock.calls[0][0].output).toMatchObject({ exists: true });
    expect(ui.review.mock.calls[0][0]).toMatchObject({ path: "/r/Reviews/2026-W46.md", before: "old review" });
    expect(ui.review.mock.calls[0][0].after).toContain("# Week");
    expect(d.write).not.toHaveBeenCalled();
    expect(runs()).toEqual({});
    await runRecipe(action(weekly), d, ui);
    expect(d.write).toHaveBeenCalledOnce();
    expect(d.snapshot).toHaveBeenCalledOnce();
  });

  it("stops when the sheet is cancelled", async () => {
    const { d, ui } = setup();
    ui.confirm.mockResolvedValueOnce(false);
    await runRecipe(action(weekly), d, ui);
    expect(d.stream).not.toHaveBeenCalled();
  });

  it("needs an engine", async () => {
    const none: UseRow = { engine: { kind: "none" }, model: "", effort: "" };
    const { d, ui } = setup();
    await runRecipe(action(weekly, { engine: none }), d, ui);
    expect(ui.fail).toHaveBeenCalledWith("Choose an engine for Weekly review in Settings ▸ AI ▸ Actions.");
    expect(ui.confirm).not.toHaveBeenCalled();
    const second = setup();
    await runRecipe(action(weekly, { engine: null }), second.d, second.ui);
    expect(second.ui.fail).toHaveBeenCalledWith("Choose an engine for Weekly review in Settings ▸ AI ▸ Use for.");
  });

  it("reports an input error", async () => {
    const { d, ui } = setup();
    await runRecipe(action({ inputs: [{ kind: "current-note" }], output: { kind: "chat" } }), d, ui);
    expect(ui.fail).toHaveBeenCalledWith("Open a note to run this recipe.");
    expect(ui.confirm).not.toHaveBeenCalled();
  });

  it("refuses to send nothing", async () => {
    const { d, ui } = setup({ modifiedMs: () => null }, {});
    await runRecipe(action({ inputs: [{ kind: "changed", days: 7 }], output: { kind: "chat" } }), d, ui);
    expect(ui.fail).toHaveBeenCalledWith("Nothing to send: the recipe's inputs found no notes.");
  });

  it("sends Chat output to the panel once", async () => {
    const { d, ui, runs } = setup();
    const chatRecipe: Recipe = { ...weekly, output: { kind: "chat" } };
    await runRecipe(action(chatRecipe), d, ui);
    expect(ui.confirm.mock.calls[0][0].output).toEqual({ kind: "chat" });
    const args = vi.mocked(d.chat).mock.calls[0][0];
    expect(args.summary).toBe("▸ Weekly review · 2 notes");
    expect(args.title).toBe("Weekly review");
    expect(args.messages[1].content).toContain("alpha");
    expect(args.context.files.length).toBe(3);
    expect(d.stream).not.toHaveBeenCalled();
    expect(d.create).not.toHaveBeenCalled();
    expect(runs()["r1\n/r"].output).toBeNull();
    expect(ui.done).toHaveBeenCalledWith("Sent to Chat");

    const failed = setup({ chat: vi.fn(async () => false) });
    await runRecipe(action(chatRecipe), failed.d, failed.ui);
    expect(failed.runs()).toEqual({});
    expect(failed.ui.done).not.toHaveBeenCalled();
    expect(failed.ui.fail).not.toHaveBeenCalled();
  });

  it("aborts the stream from the sheet's Stop", async () => {
    let seen: AbortSignal | undefined;
    const { d, ui } = setup({
      stream: vi.fn(async (_r, _m, _c, signal: AbortSignal) => {
        seen = signal;
        ui.progress.mock.calls[0][1]();
        throw new DOMException("aborted", "AbortError");
      }),
    });
    await runRecipe(action(weekly), d, ui);
    expect(ui.progress.mock.calls[0][0]).toBe("Running…");
    expect(seen?.aborted).toBe(true);
    expect(ui.fail).not.toHaveBeenCalled();
    expect(d.create).not.toHaveBeenCalled();
  });

  it("does not use the open note for a title without a current-note input", async () => {
    const { d, ui } = setup({ current: "/r/a.md" });
    await runRecipe(action({ inputs: [{ kind: "changed", days: 7 }], output: { kind: "note", path: "{{title}}.md" } }), d, ui);
    expect(ui.fail).toHaveBeenCalledWith("This recipe's output path uses the current note. Add Current note to its inputs.");
  });

  it("uses the current note for a title", async () => {
    const { d, ui } = setup({ current: "/r/a.md" });
    await runRecipe(action({ inputs: [{ kind: "current-note" }], output: { kind: "note", path: "{{dir}}/{{title}} summary.md" } }), d, ui);
    expect(ui.confirm.mock.calls[0][0].output).toEqual({ kind: "note", relative: "a summary.md", exists: false });
  });

  it("still finishes when recording fails", async () => {
    const { d, ui } = setup();
    d.runs.write = vi.fn(async () => { throw new Error("disk full"); });
    await runRecipe(action(weekly), d, ui);
    expect(d.create).toHaveBeenCalledOnce();
    expect(ui.done).toHaveBeenCalledWith("Wrote Reviews/2026-W46.md");
    expect(ui.fail).not.toHaveBeenCalled();
  });

  it("refuses to write after a folder change", async () => {
    const { d, ui, runs } = setup({ folderNow: () => "/other" });
    await runRecipe(action(weekly), d, ui);
    expect(ui.fail).toHaveBeenCalledWith("The folder changed. Run the recipe again.");
    expect(runs()).toEqual({});
  });

  it("asks for files before an empty file list runs", async () => {
    const { d, ui } = setup();
    await runRecipe(action({ inputs: [{ kind: "files", paths: [] }], output: { kind: "note", path: "research/comparison.md" } }), d, ui);
    expect(ui.fail).toHaveBeenCalledWith("Add the reports to compare first.");
    expect(ui.confirm).not.toHaveBeenCalled();
    expect(d.stream).not.toHaveBeenCalled();
  });

  it("proposes properties as a diff", async () => {
    const note = "---\ntitle: A\n---\nBody\n";
    const { d, ui, setReply, files } = setup({ current: "/r/n.md" }, { "/r/n.md": note });
    const fileThis: Recipe = { inputs: [{ kind: "current-note" }], output: { kind: "properties" } };
    setReply("title: B");
    await runRecipe(action(fileThis), d, ui);
    expect(ui.confirm.mock.calls[0][0].output).toEqual({ kind: "properties", relative: "n.md" });
    expect(ui.review.mock.calls[0][0]).toEqual({ path: "/r/n.md", before: note, after: "---\ntitle: B\n---\nBody\n" });
    expect(files["/r/n.md"]).toBe("---\ntitle: B\n---\nBody\n");

    const bad = setup({ current: "/r/n.md" }, { "/r/n.md": note });
    bad.setReply("title: [\n");
    await runRecipe(action(fileThis), bad.d, bad.ui);
    expect(bad.ui.fail).toHaveBeenCalledWith("The AI reply was not valid properties.");
    expect(bad.d.write).not.toHaveBeenCalled();
  });

  it("reports a stream error and an empty reply", async () => {
    const { d, ui } = setup({ stream: vi.fn(async () => { throw new Error("Rate limited"); }) });
    await runRecipe(action(weekly), d, ui);
    expect(ui.fail).toHaveBeenCalledWith("Rate limited");
    expect(d.create).not.toHaveBeenCalled();
    const empty = setup();
    empty.setReply("  ");
    await runRecipe(action(weekly), empty.d, empty.ui);
    expect(empty.ui.fail).toHaveBeenCalledWith("The AI returned an empty reply.");
  });
});
