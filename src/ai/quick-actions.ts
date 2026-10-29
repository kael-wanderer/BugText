import type { ContextSent } from "./context-sent";
import { isContextExcluded, exclusionMessage } from "./context-exclude";
import type { AISettings, FeatureId } from "./aisettings";
import { engineLabel, type CliInfo } from "./engines";
import { actionEngine, type RunnableAction } from "./actions";
import { hashText } from "../hash";
import { buildMessages } from "./conversation";
import { streamChat } from "./client";
import type { EditBinding } from "./edit-binding";
import { contextTrimWarning } from "./context-budget";

export type QuickActionKind = "edit" | "chat";

export type QuickAction = {
  id: string;
  label: string;
  kind: QuickActionKind;
  prompt: string;
};

export const QUICK_ACTIONS: (QuickAction & { feature: FeatureId })[] = [
  {
    id: "ai.quick.proofread",
    feature: "proofread",
    label: "Proofread",
    kind: "edit",
    prompt:
      "Proofread the text: fix grammar, spelling, and punctuation only. Preserve the meaning, tone, and all markdown formatting.",
  },
  {
    id: "ai.quick.rewrite",
    feature: "rewrite",
    label: "Rewrite",
    kind: "edit",
    prompt:
      "Rewrite the text to improve clarity, flow, and concision. Preserve the original meaning and all markdown formatting.",
  },
  {
    id: "ai.quick.summarize",
    feature: "summarize",
    label: "Summarize",
    kind: "chat",
    prompt: "Summarize the text concisely.",
  },
  {
    id: "ai.quick.outline",
    feature: "outline",
    label: "Generate outline",
    kind: "chat",
    prompt:
      "Produce a concise markdown outline (headings and bullet points) of the text.",
  },
];

export function actionScope(
  selection: string,
  docText: string,
): { text: string; whole: boolean } {
  return selection.trim()
    ? { text: selection, whole: false }
    : { text: docText, whole: true };
}

/** Models pad or strip surrounding whitespace; keep the original's so a replaced selection joins its neighbours. */
export function matchEdges(base: string, reply: string): string {
  const lead = base.match(/^\s*/)![0];
  const trail = base.trimStart() ? base.match(/\s*$/)![0] : "";
  return lead + reply.trim() + trail;
}

export function enabledQuickActions(settings: AISettings): typeof QUICK_ACTIONS {
  return QUICK_ACTIONS.filter(action => settings.enabled[action.feature]);
}

/** Minimal handle the runner needs to stream text into a chat bubble. */
export type BubbleHandle = { textContent: string | null };

export type QuickActionDeps = {
  notify?: (text: string) => void;
  onContext?: (context: ContextSent) => void;
  /** Called after a reply finishes, with the model that wrote it. */
  onReplyDone?: (meta: { model: string; seconds: number }) => void;
  getSettings: () => AISettings;
  getClis: () => CliInfo[];
  getDoc: () => {
    path?: string | null;
    text: string;
    selection: string;
    windowId: string;
    tabId: string;
    from: number;
    to: number;
  };
  /** Open the source-bound diff review for an edit-kind reply. */
  reviewEdit: (base: string, reply: string, binding: EditBinding) => void;
  appendBubble: (role: string, text: string) => BubbleHandle;
  getWorkingDir: () => string | null;
  makeAbort: () => AbortController;
};

export async function runQuickAction(
  action: (QuickAction & { feature: FeatureId }) | RunnableAction,
  deps: QuickActionDeps,
): Promise<void> {
  const normalized: RunnableAction = "label" in action ? {
    id: action.id, name: action.label, instruction: action.prompt,
    result: action.kind === "edit" ? "edit" : "answer", input: "selection-or-note",
    engine: null, feature: action.feature, panel: true,
  } : action;
  const doc = deps.getDoc();
  if (isContextExcluded(doc.path, deps.getWorkingDir(), deps.getSettings().context.exclude)) {
    const message = exclusionMessage(doc.path!, deps.getWorkingDir());
    deps.notify?.(message); deps.appendBubble("system", message); return;
  }
  const scope = actionScope(normalized.input === "note" ? "" : doc.selection, doc.text);
  if (!scope.text.trim()) {
    deps.appendBubble("system", "Nothing to send — the selection and note are empty.");
    return;
  }
  const settings = deps.getSettings();
  if (normalized.feature && !settings.enabled[normalized.feature]) return;
  const row = actionEngine(normalized, settings, deps.getClis());
  if (row.engine.kind === "none") {
    deps.appendBubble(
      "system",
      `Choose an engine for ${normalized.name} in Settings ▸ AI ▸ ${normalized.engine ? "Actions" : "Use for"}.`,
    );
    return;
  }

  const built = buildMessages({
    history: [],
    prompt: normalized.instruction,
    docText: scope.text,
    selection: "",
    editMode: normalized.result === "edit",
    files: [],
    notePath: doc.path ? doc.path.split(/[\\/]/).pop() : "Untitled",
    maxContextChars: settings.maxContextChars,
  });
  built.context.action = true;
  if (built.context.note) built.context.note.label = scope.whole ? "This note" : "Selection";
  deps.onContext?.(built.context);
  if (built.truncatedChars > 0) {
    deps.appendBubble("system", contextTrimWarning(built.truncatedChars));
  }

  if (normalized.result === "answer") {
    const lines = scope.text.split("\n").length;
    const where = scope.whole ? "on note" : `on selection (${lines} line${lines === 1 ? "" : "s"})`;
    deps.appendBubble("user", `▸ ${normalized.name} · ${where}`);
  }
  const bubble = deps.appendBubble("assistant", "");
  let reply = "";
  const started = Date.now();
  const abort = deps.makeAbort();
  try {
    await streamChat(
      row,
      settings,
      built.messages,
      (chunk) => {
        reply += chunk;
        bubble.textContent = reply.trimStart();
      },
      { write: false, folder: null, signal: abort.signal },
    );
  } catch (error) {
    const cancelled =
      error instanceof DOMException && error.name === "AbortError";
    deps.appendBubble(
      cancelled ? "system" : "error",
      cancelled
        ? "Reply cancelled."
        : error instanceof Error
          ? error.message
          : String(error),
    );
    return;
  }

  if (reply.trim()) deps.onReplyDone?.({ model: engineLabel(row, settings), seconds: (Date.now() - started) / 1000 });
  if (normalized.result === "edit") {
    const binding: EditBinding = {
      windowId: doc.windowId,
      tabId: doc.tabId,
      baseHash: hashText(doc.text),
      selection: scope.whole ? "" : doc.selection,
      from: scope.whole ? 0 : doc.from,
      to: scope.whole ? doc.text.length : doc.to,
    };
    const base = scope.whole ? doc.text : doc.selection;
    deps.reviewEdit(base, matchEdges(base, reply), binding);
  }
}
