// Connects File ▸ Import to the app: Rust commands, the file picker, the
// indexes and the Explorer. Loaded on first use, so none of it is in the
// startup chunk.

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { WorkspaceIndex } from "../ai/workspace-index";
import { localToday } from "../lifecycle/model";
import type { LinkIndex } from "../links/index";
import { createFromTemplate } from "../templates/library";
import { importFile, importWeb, type ImportDeps, type ImportKind } from "./run";
import { importUI } from "./sheet";

export type ImportHost = {
  folder: () => string | null;
  activePath: () => string | null;
  imagesFolder: () => string;
  linkIndex: LinkIndex;
  workspaceIndex: WorkspaceIndex;
  refreshExplorer: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  sheetHost: () => HTMLElement;
};

function relativeTo(folder: string | null, path: string | null): string | null {
  if (!folder || !path) return null;
  const root = `${folder.replace(/\/+$/, "")}/`;
  return path.startsWith(root) ? path.slice(root.length) : null;
}

export async function startImport(kind: ImportKind, host: ImportHost): Promise<void> {
  const folder = host.folder();
  if (folder) await host.linkIndex.ensure(folder).catch(() => {});
  const deps: ImportDeps = {
    folder: host.folder,
    activeRelative: () => relativeTo(host.folder(), host.activePath()),
    imagesFolder: host.imagesFolder,
    today: () => localToday(),
    notes: () => host.linkIndex.notes(),
    pickFile: async (file) => {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [file === "word" ? { name: "Word", extensions: ["docx"] } : { name: "CSV", extensions: ["csv"] }],
      });
      return typeof picked === "string" ? picked : null;
    },
    fetchPage: (address) => invoke("import_fetch_page", { address }),
    htmlToMarkdown: (html) => invoke("import_html_to_markdown", { html }),
    probe: (path, file) => invoke("import_probe", { path, kind: file }),
    readCsv: (path) => invoke("import_read_csv", { path }),
    copyOriginal: (args) => invoke("import_copy_original", args),
    word: (args) => invoke("import_word", args),
    create: createFromTemplate,
    created: (path, text) => {
      host.linkIndex.onFileChanged(path, text);
      host.workspaceIndex.onFileChanged(path, text);
      void host.refreshExplorer().catch(() => {});
    },
    open: (path) => void host.openPath(path),
  };
  const ui = importUI(host.sheetHost(), {
    label: (path) => relativeTo(host.folder(), path) ?? path.split("/").pop() ?? path,
    openNote: (path) => void host.openPath(path),
  });
  await (kind === "web" ? importWeb(deps, ui) : importFile(kind, deps, ui));
}
