/** Connects a recipe run to the app: indexes, tabs, disk, Chat. Loaded on first run. */
import { invoke } from "@tauri-apps/api/core";
import type { SavedAction } from "../ai/actions-store";
import type { AISettings } from "../ai/aisettings";
import { streamChat } from "../ai/client";
import { isContextExcluded } from "../ai/context-exclude";
import { engineLabel, type CliInfo } from "../ai/engines";
import type { AIPanel } from "../ai/panel";
import type { WorkspaceIndex } from "../ai/workspace-index";
import { isMarkdownFile } from "../document-kind";
import type { LinkIndex } from "../links/index";
import { loadProperties } from "../properties/loader";
import { manualSnapshot } from "../recovery";
import { createSavedViewStore, type SavedViewStore } from "../saved-views/store";
import type { TextChange } from "../tasks";
import { findTabByPath } from "../windowops";
import type { RecipeEditorDeps } from "../settings-screen/recipe-form";
import { resolveInputs } from "./inputs";
import { openRecipes, statusText } from "./list";
import { outputPath } from "./path";
import { NEEDS_FILES, runRecipe, type RunDeps } from "./run";
import { changedSources, digests, parseRuns, runKey } from "./runs";
import { recipeUI } from "./sheet";
import type { StarterRecipe } from "./starters";

type Editor = { getText(id: string): string; applyChanges(id: string, changes: TextChange[], options?: { isolate?: boolean }): void };
export type RecipeHost = {
  actions: () => SavedAction[];
  state: () => { folder: string | null; windows: Parameters<typeof findTabByPath>[0] };
  activePath: () => string | null;
  editorForTab: (tabId: string) => Editor;
  linkIndex: LinkIndex;
  workspaceIndex: WorkspaceIndex;
  settings: () => AISettings;
  clis: () => CliInfo[];
  toast: (text: string) => void;
  views: (create: () => SavedViewStore) => SavedViewStore;
  chatPanel: () => AIPanel | null; // shows the panel first
  refreshExplorer: () => Promise<void>;
  files: () => string[]; // the open folder's files, relative to it
  openActions: () => void; // Settings ▸ AI ▸ Actions
};

let pendingEdit: SavedAction | null = null;

/** Opens Settings ▸ AI ▸ Actions with this recipe (or a new one) in the editor. */
export function editRecipe(host: RecipeHost, recipe: SavedAction | StarterRecipe | null): void {
  pendingEdit = recipe ? { ...structuredClone(recipe), id: "id" in recipe && typeof recipe.id === "string" ? recipe.id : crypto.randomUUID() } :
    { id: crypto.randomUUID(), name: "", instruction: "", result: "answer", input: "note", engine: null, panel: false, recipe: { inputs: [{ kind: "current-note" }], output: { kind: "note", path: "" } } };
  host.openActions();
}

/** What the recipe editor in Settings needs from the open folder. */
export function recipeEditorDeps(host: RecipeHost, redraw: () => void): RecipeEditorDeps {
  const store = host.views(createSavedViewStore);
  if (!store.loaded) void store.reload().then(redraw, () => {});
  return {
    folder: () => host.state().folder,
    notes: () => host.files().filter(isMarkdownFile),
    pickNote: files => import("../capture/note-picker").then(({ pickNote }) => pickNote(document, files)),
    views: () => { const folder = host.state().folder; return store.items.filter(v => v.folder === folder).map(v => ({ id: v.id, name: v.name })); },
    takeEdit: () => { const edit = pendingEdit; pendingEdit = null; return edit; },
  };
}

/** The Recipes sheet (AI: Recipes…). */
export function openRecipesList(host: RecipeHost): void {
  const folder = host.state().folder;
  if (!folder) { host.toast("Open a folder to use recipes."); return; }
  let context: Promise<{ deps: RunDeps; runs: ReturnType<typeof parseRuns> }> | null = null;
  const load = () => context ??= Promise.all([recipeDeps(folder, host), invoke<string>("recipe_runs_read")]).then(([deps, text]) => ({ deps, runs: parseRuns(text) }));
  openRecipes(document.getElementById("app") ?? document.body, {
    recipes: () => host.actions().filter((a): a is SavedAction & { recipe: NonNullable<SavedAction["recipe"]> } => !!a.recipe),
    status: async action => {
      if (!action.recipe) return "";
      const { deps, runs } = await load();
      const recipe = action.recipe;
      const last = runs[runKey(action.id, folder)];
      if (recipe.inputs.some(i => i.kind === "current-note")) return statusText(recipe, last, 0);
      const out = recipe.output.kind === "note" ? outputPath(recipe.output.path, { now: deps.now, current: null }) : null;
      const output = out && "relative" in out ? `${folder.replace(/\/$/, "")}/${out.relative}` : null;
      const resolved = resolveInputs(recipe, { ...deps, recipeName: action.name, output });
      return statusText(recipe, last, changedSources(last, digests(resolved.sources, folder)));
    },
    run: action => void runRecipeById(action.id, host),
    newRecipe: starter => editRecipe(host, starter ?? null),
  });
}

export async function runRecipeById(id: string, host: RecipeHost): Promise<void> {
  const action = host.actions().find(a => a.id === id);
  if (!action?.recipe) return;
  const folder = host.state().folder;
  if (!folder) { host.toast("Open a folder to run a recipe."); return; }
  try {
    const deps = await recipeDeps(folder, host);
    if (host.state().folder !== folder) return;
    const ui = recipeUI(document.getElementById("app") ?? document.body, host.toast);
    // A recipe with an empty file list opens its editor so the files can be chosen.
    const fail = ui.fail;
    ui.fail = text => { if (text === NEEDS_FILES) { host.toast(text); editRecipe(host, action); } else fail(text); };
    await runRecipe({ ...action, recipe: action.recipe }, deps, ui);
  } catch { host.toast("Could not run the recipe."); }
}

export async function recipeDeps(folder: string, host: RecipeHost): Promise<RunDeps> {
  const props = await loadProperties();
  // Stamps change only on a scan: refresh so "changed in N days" sees notes saved a minute ago.
  await host.linkIndex.ensure(folder);
  await host.linkIndex.refresh();
  const store = host.views(createSavedViewStore);
  if (!store.loaded) await store.reload();
  const prefix = folder.replace(/\/$/, "") + "/";
  const active = host.activePath();
  const current = active && isMarkdownFile(active) && active.startsWith(prefix) ? active : null;
  const openTab = (path: string) => {
    const found = findTabByPath(host.state().windows, path);
    if (!found) return null;
    const editor = host.editorForTab(found.tab.id);
    return {
      text: editor.getText(found.tab.id),
      apply: (changes: TextChange[]) => { editor.applyChanges(found.tab.id, changes, { isolate: true }); return true; },
    };
  };
  const settings = host.settings();
  return {
    folder, current, notes: host.linkIndex.notes(), views: store.items, now: new Date(),
    textOf: path => openTab(path)?.text ?? host.linkIndex.get(path)?.source ?? null,
    modifiedMs: path => host.linkIndex.modifiedMs(path),
    isExcluded: path => isContextExcluded(path, folder, settings.context.exclude),
    includeSuperseded: settings.context.includeSuperseded,
    folderNow: () => host.state().folder,
    findOpen: openTab,
    read: path => invoke<string>("read_file", { path }),
    changed: (path, text, saved) => { host.linkIndex.onFileChanged(path, text, saved); host.workspaceIndex.onFileChanged(path, text); },
    snapshot: (path, text) => manualSnapshot(path, text, "Before recipe run", true),
    write: async (path, contents, expected) => { await invoke("write_file_atomic", { path, contents, folder, expected }); },
    create: async args => {
      const path = await invoke<string>("create_from_template", args);
      void host.refreshExplorer().catch(() => {});
      return path;
    },
    settings: host.settings, clis: host.clis, props,
    stream: (row, messages, onChunk, signal) => streamChat(row, host.settings(), messages, onChunk, { folder: null, write: false, signal }),
    chat: async args => {
      if (!host.settings().enabled.chat) { host.toast("Turn on Chat in Settings ▸ AI to send a recipe to Chat."); return false; }
      const panel = host.chatPanel();
      return panel ? panel.runPrepared(args) : false;
    },
    runs: { read: () => invoke<string>("recipe_runs_read"), write: contents => invoke<void>("recipe_runs_write", { contents }) },
    engineLabel: row => engineLabel(row, host.settings()),
    abort: () => new AbortController(),
  };
}
