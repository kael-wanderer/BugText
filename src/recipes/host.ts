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
import { runRecipe, type RunDeps } from "./run";
import { recipeUI } from "./sheet";

type Editor = { getText(id: string): string; applyChanges(id: string, changes: TextChange[], options?: { isolate?: boolean }): void };
export type RecipeHost = {
  actions: () => SavedAction[];
  folder: () => string | null;
  windows: () => Parameters<typeof findTabByPath>[0];
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
};

export async function runRecipeById(id: string, host: RecipeHost): Promise<void> {
  const action = host.actions().find(a => a.id === id);
  if (!action?.recipe) return;
  const folder = host.folder();
  if (!folder) { host.toast("Open a folder to run a recipe."); return; }
  try {
    const deps = await recipeDeps(folder, host);
    if (host.folder() !== folder) return;
    await runRecipe({ ...action, recipe: action.recipe }, deps, recipeUI(document.getElementById("app") ?? document.body, host.toast));
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
    const found = findTabByPath(host.windows(), path);
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
    folderNow: host.folder,
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
