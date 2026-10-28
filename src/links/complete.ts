import { startCompletion, autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { markdownOutline } from "../outline";
import { scanMarkdownLines } from "../markdown-blocks";
import { rankItems } from "../fuzzy";
import { headingAnchors, formatLinkTarget } from "./parse";
import { resolveLink } from "./resolve";
import type { LinkIndex } from "./index";
export type WriteContext = { path: string; untitled: boolean };
let services: { index: LinkIndex; context: (id: string) => WriteContext | null; enabled: () => boolean } | null = null;
export function configureLinkCompletion(next: NonNullable<typeof services>) { services = next; }
export function completionSource(id: string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const s = services;
    const note = s?.context(id);
    if (!s || !note || !s.enabled() || !s.index.folder) return null;
    const line = context.state.doc.lineAt(context.pos);
    if (scanMarkdownLines(context.state.doc.toString())[line.number - 1]?.code) return null;
    const before = line.text.slice(0, context.pos - line.from);
    const match = /(?:\]\(|^ {0,3}\[[^\]]+\]:\s+)([^\n]*)$/.exec(before);
    if (!match || /\)\s/.test(match[1])) return null;
    for (const span of line.text.matchAll(/(`+).*?\1/g)) {
      const at = span.index!;
      const position = context.pos - line.from;
      if (at < position && position <= at + span[0].length) return null;
    }
    const from = context.pos - match[1].length;
    if (!s.index.ready) {
      // The pending source is retried after the first background scan.
      void s.index.ensure().then(() => { if (context.view) startCompletion(context.view); }).catch(() => {});
      return { from, options: [{ label: "Indexing notes…", apply: () => {}, type: "text" }], validFor: /[^\n]*/ };
    }
    const raw = match[1].replace(/^</, "");
    const hash = raw.indexOf("#");
    const reference = /^ {0,3}\[[^\]]+\]:/.test(before);
    const suffix = reference || context.state.sliceDoc(context.pos, context.pos + 1) === ")" ? "" : ")";
    const detail = note.untitled ? "Save this note to link relative to its folder." : undefined;
    if (hash >= 0) {
      const target = raw.slice(0, hash).replace(/>$/, "");
      const resolved = resolveLink(target || "#", note.path, s.index.folder);
      const targetNote = s.index.get(resolved.path ?? "");
      const headings = headingAnchors(resolved.path === note.path ? markdownOutline(context.state.doc.toString()) : targetNote?.headings ?? []);
      return { from, filter: false, options: rankItems(raw.slice(hash + 1), headings, (h) => h.text).map((h) => ({ label: h.text, detail: `#${h.anchor}`, apply: target ? formatLinkTarget(note.path, resolved.path!, h.anchor) + suffix : `#${h.anchor}${suffix}` })) };
    }
    return { from, filter: false, options: rankItems(raw, s.index.notes(), (n) => n.path.slice(s.index.folder!.length + 1)).slice(0, 100).map((n) => ({ label: n.path.split("/").pop()!, detail: detail ?? n.path.slice(s.index.folder!.length + 1), apply: formatLinkTarget(note.path, n.path) + suffix })) };
  };
}
export const linkCompletion = (id: string) => autocompletion({ override: [completionSource(id)] });
