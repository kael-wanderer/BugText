// Relative images in the Markdown preview load from the note's folder through
// preview://, which serves only folders registered with `preview_allow`.
import { invoke } from "@tauri-apps/api/core";
import { htmlPreviewBaseHref } from "./document-kind";
import { isRelativeImageSrc } from "./image-insert";

const allowed = new Map<string, Promise<boolean>>();

function allowFolder(notePath: string): Promise<boolean> {
  const dir = notePath.slice(0, notePath.lastIndexOf("/"));
  let ready = allowed.get(dir);
  if (!ready) {
    ready = invoke("preview_allow", { path: notePath }).then(
      () => true,
      () => false,
    );
    allowed.set(dir, ready);
  }
  return ready;
}

export function missingImage(src: string): HTMLElement {
  const note = document.createElement("span");
  note.className = "img-missing";
  note.textContent = `Image not found · ${src}`;
  return note;
}

/** Points relative `<img>` sources at the note's folder; missing files get a placeholder. */
export function resolvePreviewImages(root: HTMLElement, notePath: string | null): void {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img")).filter((img) =>
    isRelativeImageSrc(img.getAttribute("src") ?? ""),
  );
  if (!images.length) return;
  const base = notePath ? htmlPreviewBaseHref(notePath) : null;
  for (const img of images) {
    const src = img.getAttribute("src") ?? "";
    // Without a src the webview never tries the app origin first.
    img.removeAttribute("src");
    if (!base || !notePath) {
      img.replaceWith(missingImage(src));
      continue;
    }
    img.addEventListener("error", () => img.replaceWith(missingImage(src)), { once: true });
    void allowFolder(notePath).then((ok) => {
      if (!ok) img.replaceWith(missingImage(src));
      else img.src = new URL(src, base).href;
    });
  }
}
