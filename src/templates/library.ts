// Thin wrappers over the Rust template commands.

import { invoke } from "@tauri-apps/api/core";

export type TemplateInfo = { name: string; path: string; size: number };

/** Lists templates; the default folder is created with starters on first use. */
export const listTemplates = (custom: string): Promise<TemplateInfo[]> =>
  invoke("list_templates", { custom });

export const readTemplate = (path: string): Promise<string> => invoke("read_template", { path });

export const templatesFolder = (custom: string): Promise<string> => invoke("templates_folder", { custom });

/** Creates an empty, numbered `Untitled template.md` and returns its path. */
export const createTemplateFile = (custom: string): Promise<string> => invoke("create_template", { custom });

export const createFromTemplate = (args: {
  folder: string;
  relativeDir: string;
  stem: string;
  contents: string;
}): Promise<string> => invoke("create_from_template", args);

export const appendNote = (folder: string, relative: string, text: string): Promise<string> =>
  invoke("append_note", { folder, relative, text });
