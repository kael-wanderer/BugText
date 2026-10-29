import type { SearchOptions } from "../filesys";
import { applyReplace, undoReplace, type ReplaceDeps, type Failure } from "./apply";
import type { ReplacePreview, ReplaceSelection } from "./plan";

type OpenTab = { path: string; text: string; dirty: boolean };
type FlowDeps = {
  folder: () => string | null;
  tabs: () => OpenTab[];
  invoke: <T>(command: string, args: Record<string, unknown>) => Promise<T>;
  writer: (folder: string) => ReplaceDeps;
  review: (preview: ReplacePreview, query: string, replacement: string, options: string, tag: (relative: string) => string | null) => Promise<ReplaceSelection | null>;
  result: (changed: { path: string; matches: number }[], failures: Failure[], undo: () => void) => () => void;
  refresh: () => void;
};
export function createReplaceFlow(deps: FlowDeps) {
  let serial = 0, generation = 0, invalidate: (() => void) | undefined;
  let previewFolder = "";
  return {
    async preview(query: string, replacement: string, options: SearchOptions, files: string[]) {
      const folder = deps.folder(); if (!folder) throw Error("Open a folder first.");
      previewFolder = folder;
      const root = folder.replace(/[\\/]$/, "") + (folder.includes("\\") ? "\\" : "/");
      const overrides: Record<string, string> = {};
      for (const tab of deps.tabs()) if (tab.path.startsWith(root)) overrides[tab.path.slice(root.length).replace(/\\/g, "/")] = tab.text;
      return deps.invoke<ReplacePreview>("replace_preview", { request: { folder, files, query, replacement, options, overrides, request_id: `replace-${Date.now()}-${++serial}` } });
    },
    async show(preview: ReplacePreview, query: string, replacement: string, options: SearchOptions) {
      const folder = previewFolder;
      if (!folder || deps.folder() !== folder) return;
      const root = folder.replace(/[\\/]$/, "") + (folder.includes("\\") ? "\\" : "/");
      const flags = [options.caseSensitive && "Aa", options.wholeWord && "ab", options.regex && ".*"].filter(Boolean).join(" ");
      const selection = await deps.review(preview, query, replacement, flags, relative => {
        const tab = deps.tabs().find(t => t.path === root + relative); return tab ? (tab.dirty ? "Open · unsaved" : "Open") : null;
      });
      if (!selection) return;
      invalidate?.(); invalidate = undefined; const current = ++generation;
      const writer = deps.writer(folder);
      const result = await applyReplace(preview, selection, folder, writer, query, replacement);
      deps.refresh();
      if (current !== generation) return;
      invalidate = deps.result(result.changed, result.notChanged, () => {
        if (current !== generation) return;
        ++generation; invalidate = undefined;
        void undoReplace(result.undo, writer).then(outcome => { deps.refresh(); if (outcome.notUndone.length) deps.result([], outcome.notUndone, () => {}); });
      });
    },
  };
}
