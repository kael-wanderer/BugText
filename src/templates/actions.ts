// Glue between the template modules and the app: what happens after a note is
// created, and the folder shortcuts the picker and Settings offer.

import type { TemplateSettings } from "../settings";
import { relativePath } from "../paths";
import { showToast } from "../toast";
import { invoke } from "@tauri-apps/api/core";
import { recordStat } from "../recovery";
import { appendNote, createFromTemplate, createTemplateFile, listTemplates, readTemplate, templatesFolder } from "./library";
import { showTemplatePicker } from "./picker";
import { showQuickNote } from "./quick-note-popover";

export type TemplateHost = {
  host: () => HTMLElement;
  getFolder: () => string | null;
  getTemplates: () => TemplateSettings;
  setLastUsed: (name: string) => void;
  /** Reloads the Explorer tree and the file list. */
  refreshExplorer: () => Promise<void>;
  revealInExplorer: (path: string) => Promise<void>;
  openPath: (path: string) => Promise<void>;
  /** Opens an unsaved Untitled tab holding `text`, cursor at `cursor`. */
  openUntitled: (text: string, cursor: number) => void;
  placeCursor: (path: string, offset: number) => void;
  revealInFinder: (path: string) => Promise<void>;
  /** The note's tab in any window, with its buffer. */
  findOpenTab: (path: string) => { tabId: string; text: string } | null;
  appendToTab: (tabId: string, text: string) => void;
  /** Keeps the AI workspace index current after a note changed on disk. */
  afterDiskWrite: (path: string) => void;
};

export type TemplateActions = {
  /** `directory` is an absolute Explorer folder that replaces the template's own. */
  newFromTemplate: (directory?: string) => void;
  openTemplatesFolder: () => Promise<void>;
  newTemplate: () => Promise<void>;
  quickNote: () => void;
};

export function createTemplateActions(host: TemplateHost): TemplateActions {
  const openCreated = async (path: string, cursor: number): Promise<void> => {
    await host.refreshExplorer().catch(() => {});
    await host.revealInExplorer(path).catch(() => {});
    await host.openPath(path);
    host.placeCursor(path, cursor);
  };

  const openTemplatesFolder = async (): Promise<void> => {
    const custom = host.getTemplates().folder;
    try {
      await listTemplates(custom);
      const path = await templatesFolder(custom);
      const open = host.getFolder();
      if (open && path.startsWith(`${open}/`)) await host.revealInExplorer(path);
      else await host.revealInFinder(path);
    } catch {
      showToast("Templates folder not found.");
    }
  };

  const newTemplate = async (): Promise<void> => {
    try {
      await host.openPath(await createTemplateFile(host.getTemplates().folder));
    } catch {
      showToast("Could not create the template.");
    }
  };

  const newFromTemplate = (directory?: string): void => {
    const folder = host.getFolder();
    const settings = host.getTemplates();
    const targetDir = directory !== undefined && folder ? relativePath(folder, directory) : null;
    void showTemplatePicker({
      host: host.host(),
      folder,
      targetDir,
      format: settings.dateFormat,
      defaultFolder: settings.defaultFolder,
      lastUsed: settings.lastUsed,
      now: () => new Date(),
      list: () => listTemplates(settings.folder),
      read: readTemplate,
      create: createFromTemplate,
      onCreated: (path, cursor) => void openCreated(path, cursor),
      onUntitled: host.openUntitled,
      onUsed: host.setLastUsed,
      openTemplatesFolder: () => void openTemplatesFolder(),
      newTemplate: () => void newTemplate(),
    });
  };

  const dailyTemplate = async (): Promise<string | null> => {
    const found = (await listTemplates(host.getTemplates().folder)).find((info) => info.name.toLowerCase() === "daily log");
    if (!found) return null;
    try { return await readTemplate(found.path); } catch { return null; }
  };

  const quickNote = (): void => {
    if (!host.getFolder()) {
      showToast("Open a folder to use Quick Note.");
      return;
    }
    void showQuickNote({
      host: host.host(),
      noteDeps: () => {
        const folder = host.getFolder();
        if (!folder) return null;
        return {
          folder,
          settings: host.getTemplates(),
          now: () => new Date(),
          dailyTemplate,
          findOpen: host.findOpenTab,
          appendToTab: host.appendToTab,
          exists: (path) => invoke("file_stat", { path }).then(() => true, () => false),
          create: createFromTemplate,
          append: appendNote,
          recordStat,
          afterWrite: host.afterDiskWrite,
          refreshExplorer: host.refreshExplorer,
        };
      },
      onAdded: (path) => showToast(`Added to ${path.split("/").pop()}`, 4000, { label: "Open", run: () => void host.openPath(path) }),
    });
  };

  return { newFromTemplate, openTemplatesFolder, newTemplate, quickNote };
}
