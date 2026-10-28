import { openUrl } from "@tauri-apps/plugin-opener";
import { headingAnchors, noteLinks } from "./parse";
import { markdownOutline } from "../outline";
import { resolveLink } from "./resolve";
import type { LinkIndex } from "./index";

export type LinkContext = { path: string; text: string; folder: string | null };
type Services = {
  index: LinkIndex;
  context: (id: string) => LinkContext | null;
  open: (path: string, other: boolean) => Promise<void>;
  jump: (line: number) => void;
  read: (path: string) => Promise<string>;
  create: (folder: string, path: string) => Promise<void>;
  toast: (text: string, action?: { label: string; run: () => void }) => void;
};
let services: Services | null = null;
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
  if (resolved.kind === "file") { await s.open(resolved.path, other).catch(() => s.toast("Could not open file")); return; }
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
      if (broken) a.title = broken;
      else if (a.title === "Note not found" || a.title === "Heading not found") a.removeAttribute("title");
    });
  };
  const observer = new MutationObserver(decorate);
  observer.observe(host, { childList: true, subtree: true });
  const unsubscribe = services?.index.subscribe(decorate);
  return () => { observer.disconnect(); unsubscribe?.(); host.removeEventListener("click", click); host.removeEventListener("auxclick", click); };
}
