// Paste and drop images into Markdown notes: write or copy the file beside the
// note (Rust `assets.rs`), then insert a relative Markdown link.
import { invoke } from "@tauri-apps/api/core";
import {
  altFromName,
  folderLabel,
  imageMarkdown,
  pastedImageStem,
  type PasteNameStyle,
} from "./image-insert";

type NoteImage = { link: string; name: string; copied: boolean };

export type NoteImageDeps = {
  folder: () => string;
  pasteName: () => PasteNameStyle;
  /** The note's saved path, offering to save an untitled note first. */
  ensureSaved: (windowId: string, tabId: string) => Promise<string | null>;
  insert: (windowId: string, tabId: string, text: string, at?: number, cursor?: number) => void;
  toast: (text: string) => void;
  error: (text: string) => Promise<void>;
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Clipboard images arrive as PNG, TIFF or JPEG; notes always get PNG. */
async function pngBytes(file: File): Promise<Uint8Array> {
  if (file.type === "image/png") return new Uint8Array(await file.arrayBuffer());
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The clipboard image could not be read.");
  return new Uint8Array(await blob.arrayBuffer());
}

function addedMessage(images: NoteImage[], folder: string): string {
  const copied = images.filter((image) => image.copied);
  if (!copied.length) return images.length === 1 ? `Linked ${images[0].name}` : `Linked ${images.length} images`;
  const what = copied.length === 1 ? copied[0].name : `${copied.length} images`;
  return `Added ${what} to ${folderLabel(folder)}`;
}

export function createNoteImages(deps: NoteImageDeps) {
  async function paste(windowId: string, tabId: string, files: File[]): Promise<void> {
    const notePath = await deps.ensureSaved(windowId, tabId);
    if (!notePath) return;
    const folder = deps.folder();
    const added: NoteImage[] = [];
    try {
      for (const file of files) {
        const bytes = await pngBytes(file);
        added.push(
          await invoke<NoteImage>("save_note_image", {
            notePath,
            folder,
            nameHint: pastedImageStem(notePath, deps.pasteName(), new Date()),
            bytes: Array.from(bytes),
          }),
        );
      }
    } catch (error) {
      await deps.error(errorText(error));
    }
    if (!added.length) return;
    const text = added.map((image) => imageMarkdown("", image.link)).join("\n");
    // One image: the cursor lands inside `[]` for alt text.
    deps.insert(windowId, tabId, text, undefined, added.length === 1 ? 2 : text.length);
    deps.toast(addedMessage(added, folder));
  }

  async function drop(windowId: string, tabId: string, paths: string[], at: number | null): Promise<void> {
    const notePath = await deps.ensureSaved(windowId, tabId);
    if (!notePath) return;
    const folder = deps.folder();
    const added: NoteImage[] = [];
    const failures: string[] = [];
    for (const source of paths) {
      try {
        added.push(await invoke<NoteImage>("copy_note_image", { notePath, folder, source }));
      } catch (error) {
        failures.push(errorText(error));
      }
    }
    if (added.length) {
      const text = added.map((image) => imageMarkdown(altFromName(image.name), image.link)).join("\n");
      deps.insert(windowId, tabId, text, at ?? undefined);
      deps.toast(addedMessage(added, folder));
    }
    if (failures.length) await deps.error(failures.join("\n"));
  }

  return { paste, drop };
}

export type NoteImages = ReturnType<typeof createNoteImages>;
