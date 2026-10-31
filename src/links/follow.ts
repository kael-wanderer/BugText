import { parsePdfAnchor } from "../pdf-annotations/model";
import { openUrl } from "@tauri-apps/plugin-opener";
import { headingAnchors, noteLinks } from "./parse";
import { markdownOutline } from "../outline";
import { resolveLink } from "./resolve";
import type { LinkIndex } from "./index";
import type { createHoverCard } from "./hover-card";
import { cardStateForTarget } from "./hover-state";

export type LinkContext = { path: string; text: string; folder: string | null };
type Services = {
  index: LinkIndex;
  hoverPreview?: () => boolean;
  hoverCard?: ReturnType<typeof createHoverCard>;
  context: (id: string) => LinkContext | null;
  open: (path: string, other: boolean) => Promise<void>;
  jump: (line: number) => void;
  openPdfAt?: (page: number, annotation?: string) => void;
  read: (path: string) => Promise<string>;
  create: (folder: string, path: string) => Promise<void>;
  toast: (text: string, action?: { label: string; run: () => void }) => void;
};
let services: Services | null = null;
const decorators = new Set<() => void>();
export function refreshPreviewLinks(): void { decorators.forEach(decorate => decorate()); }
export function configureLinks(next: Services) { services = next; }
export function linkAt(text: string, position: number) {
  return noteLinks(text).find((link) => {
    const start = text.lastIndexOf("[", link.start);
    return position >= start && position <= link.end + (text[link.end] === ">" ? 2 : 1);
  });
}
export async function followLink(target: string, context: LinkContext, other = false): Promise<void> {
  const s = services;
  if (!s) return;
  const resolved = resolveLink(target, context.path, context.folder);
  if (resolved.kind === "invalid" || !resolved.path) return;
  if (resolved.kind === "web") { await openUrl(resolved.path).catch(() => s.toast("Could not open link")); return; }
  if (resolved.kind === "file") {
    try {
      await s.open(resolved.path, other);
      if (/\.pdf$/i.test(resolved.path) && resolved.anchor) {
        const anchor = parsePdfAnchor(resolved.anchor);
        if (anchor.page) s.openPdfAt?.(anchor.page, anchor.annotation);
      }
    } catch { s.toast("Could not open file"); }
    return;
  }
  let text: string;
  try { text = await s.read(resolved.path); }
  catch {
    if (resolved.kind === "note" && context.folder) {
      const path = resolved.path;
      s.toast(`Note not found: ${target}`, { label: "Create", run: () => {
        void s.create(context.folder!, path).then(() => s.open(path, other)).catch(() => s.toast("Could not create note"));
      } });
    } else s.toast("Could not open file");
    return;
  }
  await s.open(resolved.path, other);
  if (resolved.anchor !== undefined) {
    const heading = headingAnchors(markdownOutline(text)).find((h) => h.anchor === resolved.anchor);
    s.jump(heading?.line ?? 1);
    if (!heading) s.toast(`Heading not found: #${resolved.anchor}`);
  }
}
export function followEditorLink(id: string, text: string, position: number) {
  const context = services?.context(id);
  const link = linkAt(text, position);
  if (context && link) void followLink(link.target, context);
  return Boolean(context && link);
}
export function bindPreviewLinks(host: HTMLElement, context: () => LinkContext | null) {
  const click = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    if (!anchor || !host.contains(anchor)) return;
    event.preventDefault();
    if (event.type === "auxclick" && event.button !== 1) return;
    const current = context();
    if (current) void followLink(anchor.getAttribute("href") ?? "", current, event.metaKey || event.ctrlKey || event.button === 1);
  };
  const attached = new Set<HTMLElement>();
  const attachHover = (event: Event) => {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!anchor || !host.contains(anchor) || !services?.hoverCard) return;
    const card = services.hoverCard; for (const old of attached) if (!host.contains(old)) { card.detach(old); attached.delete(old); } attached.add(anchor);
    const state = () => { const current = context(); const s = services; return current && s?.hoverPreview?.() ? cardStateForTarget(s.index, anchor.getAttribute("href") ?? "", current.path) : null; };
    card.attach(anchor, state, "pointer"); card.attach(anchor, state, "focus");
  };
  host.addEventListener("pointerover", attachHover); host.addEventListener("focusin", attachHover);
  host.addEventListener("click", click);
  host.addEventListener("auxclick", click);
  const decorate = () => {
    const current = context();
    if (!current || !services) return;
    if (!services.index.ready) {
      if (current.folder && host.querySelector("a[href]")) void services.index.ensure(current.folder).catch(() => {});
      return;
    }
    const outgoing = services.index.outgoing(current.path, current.text);
    host.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      const target = a.getAttribute("href");
      const broken = outgoing.find((link) => link.target === target || encodeURI(link.target) === target)?.broken;
      a.classList.toggle("broken-note-link", Boolean(broken));
      if (broken && !services?.hoverPreview?.()) a.title = broken;
      else if (a.title === "Note not found" || a.title === "Heading not found") a.removeAttribute("title");
    });
  };
  const observer = new MutationObserver(() => { services?.hoverCard?.hide(); decorate(); });
  observer.observe(host, { childList: true, subtree: true });
  let previousFolder = services?.index.folder;
  const unsubscribe = services?.index.subscribe(() => { if (services?.index.folder !== previousFolder) { previousFolder = services?.index.folder; services?.hoverCard?.hide(); } else services?.hoverCard?.refresh(); decorate(); });
  decorators.add(decorate); decorate();
  return () => { decorators.delete(decorate); observer.disconnect(); unsubscribe?.(); for (const anchor of attached) services?.hoverCard?.detach(anchor); host.removeEventListener("pointerover", attachHover); host.removeEventListener("focusin", attachHover); host.removeEventListener("click", click); host.removeEventListener("auxclick", click); };
}
