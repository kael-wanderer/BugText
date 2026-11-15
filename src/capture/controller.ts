// Capture while reading: what Excerpt, Task, Ask AI, Copy link, the Notes button and
// Add note do. main.ts supplies the app services; this file holds the flow.

import type { Settings } from "../settings";
import { closeFence, escapeMarkdown, excerptBlock, linkLabel, linkTarget, noteEntry, sourceRef, taskLine } from "./format";
import type { CaptureAction } from "./menu";
import { pickNote } from "./note-picker";
import type { Passage } from "./selection";
import { showCaptureSheet } from "./sheet";
import { folderRelative, rememberedTarget, resolveTarget, withRemembered, type CaptureTarget, type ResolvedTarget } from "./targets";
import { writeCapture, type CaptureResult, type CaptureWriteDeps } from "./write";

export type ActiveNote = { folder: string | null; path: string | null; text: string; passage: Passage | null };
export type CaptureHost = {
  doc: Document;
  active: () => ActiveNote | null;
  writer: (folder: string) => CaptureWriteDeps;
  settings: () => Settings;
  saveSettings: (next: Settings) => void;
  /** Markdown notes of the open folder, relative to it. */
  noteFiles: () => string[];
  openInSub: (absolute: string) => Promise<void>;
  copy: (text: string) => Promise<void>;
  ask: (passage: Passage) => void;
  toast: (text: string, action?: { label: string; run: () => void }) => void;
  /** A capture changed this note: refresh what shows its count. */
  written: (absolute: string) => void;
  now: () => Date;
};

const NO_FOLDER = "Open the note from a folder to save excerpts.";
const fileName = (path: string): string => path.replace(/\\/g, "/").split("/").pop() ?? path;
const absoluteOf = (folder: string, relative: string): string => `${folder.replace(/\/+$/, "")}/${relative}`;

function isoDate(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Source = { folder: string; path: string; text: string };

export function createCapture(host: CaptureHost) {
  /** The active note when it sits inside the open folder; otherwise toasts and returns null. */
  function source(): (Source & { passage: Passage | null }) | null {
    const note = host.active();
    if (!note) return null;
    if (!note.folder || !note.path || folderRelative(note.folder, note.path) === null) { host.toast(NO_FOLDER); return null; }
    return { folder: note.folder, path: note.path, text: note.text, passage: note.passage };
  }

  async function write(folder: string, target: ResolvedTarget, entry: string): Promise<CaptureResult | null> {
    try {
      const result = await writeCapture(host.writer(folder), target, entry);
      host.written(result.path);
      if (result.renamed) {
        host.toast(`The note was created by another app meanwhile; your entry is in ${fileName(result.path)}.`);
        await host.openInSub(result.path);
      }
      return result;
    } catch (error) {
      host.toast(error instanceof Error && error.message.startsWith("Could not save a Recovery") ? error.message : "Could not save the entry.");
      return null;
    }
  }

  function companion(src: Source, title: string): ResolvedTarget | null {
    const resolved = resolveTarget(src.folder, src.path, title, { kind: "companion" }, host.now());
    if ("error" in resolved) { host.toast(resolved.error); return null; }
    return resolved;
  }

  async function capture(kind: "excerpt" | "task", src: Source, passage: Passage): Promise<void> {
    const ref = sourceRef(src.path, src.text, passage.line);
    const label = linkLabel(ref);
    const hint = (target: CaptureTarget): string => {
      const resolved = resolveTarget(src.folder, src.path, ref.title, target, host.now());
      if ("error" in resolved) return resolved.error;
      return target.kind === "companion" ? `${fileName(resolved.relative)}, beside the document` : resolved.relative;
    };
    const result = await showCaptureSheet(host.doc, {
      kind, quote: passage.quote, label,
      target: rememberedTarget(host.settings(), src.folder, kind),
      targetHint: hint,
      chooseNote: () => pickNote(host.doc, host.noteFiles()),
    });
    if (!result) return;
    const target = resolveTarget(src.folder, src.path, ref.title, result.target, host.now());
    if ("error" in target) { host.toast(target.error); return; }
    const link = linkTarget(absoluteOf(src.folder, target.relative), src.path, ref);
    // A preview selection is rendered text: escape it so it renders back the same.
    // An editor selection is already Markdown.
    const text = passage.source === "preview" ? escapeMarkdown(result.text) : closeFence(result.text);
    const entry = kind === "excerpt"
      ? excerptBlock(text, label, link, isoDate(host.now()), result.comment)
      : taskLine(text, link);
    const written = await write(src.folder, target, entry);
    if (!written) return;
    const before = rememberedTarget(host.settings(), src.folder, kind);
    if (JSON.stringify(before) !== JSON.stringify(result.target)) host.saveSettings(withRemembered(host.settings(), src.folder, kind, result.target));
    if (!written.renamed) host.toast(`Saved to ${fileName(written.path)}`, { label: "Open", run: () => void host.openInSub(written.path) });
  }

  return {
    async run(action: CaptureAction): Promise<void> {
      const src = source();
      if (!src?.passage) return;
      const passage = src.passage;
      if (action === "ask") { host.ask(passage); return; }
      if (action === "copy") {
        const ref = sourceRef(src.path, src.text, passage.line);
        const target = linkTarget(absoluteOf(src.folder, "_.md"), src.path, ref);
        try { await host.copy(`[${linkLabel(ref)}](${target})`); host.toast("Link copied"); }
        catch { host.toast("Could not copy the link."); }
        return;
      }
      await capture(action, src, passage);
    },

    /** Opens the companion note in the Sub pane, creating it first when missing. */
    async openNotes(): Promise<void> {
      const src = source();
      if (!src) return;
      const target = companion(src, sourceRef(src.path, src.text, 1).title);
      if (!target) return;
      const path = absoluteOf(src.folder, target.relative);
      const deps = host.writer(src.folder);
      if (!deps.findOpen(path) && !(await deps.exists(path))) {
        // The missing-note route of writeCapture: the starter text only.
        const created = await write(src.folder, target, "");
        if (created && !created.renamed) await host.openInSub(created.path);
        return;
      }
      await host.openInSub(path);
    },

    /** Add note (HTML files): a dated entry in the companion note. */
    async addNote(): Promise<void> {
      const src = source();
      if (!src) return;
      const title = sourceRef(src.path, src.text, 1).title;
      const target = companion(src, title);
      if (!target) return;
      const result = await showCaptureSheet(host.doc, {
        kind: "note", quote: "", label: title, target: { kind: "companion" },
        targetHint: () => "", chooseNote: async () => null,
      });
      if (!result) return;
      const link = linkTarget(absoluteOf(src.folder, target.relative), src.path, { title, heading: null, anchor: null });
      const written = await write(src.folder, target, noteEntry(title, link, isoDate(host.now()), result.comment));
      if (written && !written.renamed) host.toast(`Saved to ${fileName(written.path)}`, { label: "Open", run: () => void host.openInSub(written.path) });
    },
  };
}

export type Capture = ReturnType<typeof createCapture>;
