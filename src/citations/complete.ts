import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { scanMarkdownLines } from "../markdown-blocks";
import { rankItems } from "../fuzzy";
import type { LibraryResult } from "./csl-json";
let services: { enabled: () => boolean; load: (id: string, text: string) => Promise<LibraryResult> } | null = null;
export function configureCitationCompletion(next: NonNullable<typeof services>): void { services = next; }
export function citationCompletionSource(id: string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const s = services; if (!s?.enabled()) return null;
    const line = context.state.doc.lineAt(context.pos); const position = context.pos - line.from;
    if (scanMarkdownLines(context.state.doc.toString())[line.number - 1]?.code) return null;
    for (const span of line.text.matchAll(/(`+).*?\1/g)) if (span.index! < position && position <= span.index! + span[0].length) return null;
    const before = line.text.slice(0, position); const match = /(?:\[-?|;\s*-?)@([^\s;\]]*)$/.exec(before);
    if (!match) return null;
    const open = before.lastIndexOf("["); if (open < 0 || before.lastIndexOf("]") > open) return null;
    const result = await s.load(id, context.state.doc.toString());
    if (context.aborted || result.status !== "ok") return null;
    const close = line.text.slice(position).includes("]") ? "" : "]";
    return { from: context.pos - match[1].length, filter: false, options: rankItems(match[1], [...result.library.entries.values()], e => `${e.key} ${e.authors.join(" ")} ${e.year} ${e.title}`).slice(0, 100).map(e => ({ label: e.key, detail: `${e.authors.join(", ")} · ${e.year || "n.d."}`, info: e.title, apply: (/^[\w](?:[\w:.#$%&+?<>~/-]*[\w])?$/.test(e.key) ? e.key : `{${e.key}}`) + close })) };
  };
}
