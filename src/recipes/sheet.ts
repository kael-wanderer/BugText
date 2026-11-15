/** The run sheet, progress, review and result of one recipe run. All text by textContent. */
import { lineDiff } from "../ai/diff";
import { action, node, organizeSheet } from "../notes/sheet";
import { diffFits } from "../review/changes";
import type { LeftOut } from "./inputs";
import type { RunPlan, RunUI } from "./run";

const REASONS: Record<LeftOut["reason"], string> = {
  superseded: "left out: superseded",
  excluded: "left out: excluded from AI context",
  missing: "not found",
  limit: "over 200 notes",
  generated: "left out: written by this recipe",
};
const count = (n: number) => n.toLocaleString("en-US");
const basename = (path: string) => path.split("/").pop() ?? path;

function outputLine(output: RunPlan["output"]): string {
  if (output.kind === "chat") return "Output Chat";
  if (output.kind === "properties") return `Output Properties of ${output.relative} · shown as a diff`;
  return `Output ${output.relative} · ${output.exists ? "exists, will show a diff" : "new note"}`;
}

/** One sheet at a time: each step replaces the previous one. `notify` shows a finished run as a toast. */
export function recipeUI(host: HTMLElement, notify?: (text: string) => void): RunUI {
  let current: { close(): void; detach(): void } | null = null;

  // Opens a sheet; `onDismiss` runs when the person closes it (Close, Esc), not when the next step replaces it.
  function open(title: string, onDismiss: () => void) {
    current?.detach();
    let replaced = false;
    const sheet = organizeSheet(host, title);
    sheet.body.classList.add("recipe-sheet");
    sheet.cleanup(() => { if (!replaced) onDismiss(); });
    const handle = { close: () => sheet.close(), detach: () => { replaced = true; sheet.close(); } };
    current = handle;
    sheet.cleanup(() => { if (current === handle) current = null; });
    return sheet;
  }
  function buttons(...items: HTMLButtonElement[]) {
    const row = node("div"); row.className = "organize-actions"; row.append(...items); return row;
  }

  return {
    confirm(plan) {
      return new Promise(resolve => {
        let answered = false;
        const answer = (value: boolean) => { if (answered) return; answered = true; resolve(value); };
        const sheet = open(`Run "${plan.name}"`, () => answer(false));
        const chars = plan.sources.reduce((sum, s) => sum + s.chars, 0);
        const n = plan.sources.length;
        sheet.body.append(node("h3", `Inputs · ${n} ${n === 1 ? "note" : "notes"} · ${count(chars)} characters`));
        const list = node("ul"); list.className = "recipe-sources";
        for (const source of plan.sources) {
          const li = node("li"); li.append(node("span", source.label), node("span", count(source.chars))); list.append(li);
        }
        for (const item of plan.leftOut) {
          const li = node("li"); li.className = "recipe-left-out"; li.append(node("span", item.path), node("span", REASONS[item.reason])); list.append(li);
        }
        sheet.body.append(list);
        if (plan.trimmed > 0) sheet.body.append(node("p", `Context limit: ${count(plan.trimmed)} characters cut.`));
        sheet.body.append(node("p", `Engine ${plan.engine}`), node("p", outputLine(plan.output)));
        const run = action("Run", () => { answer(true); sheet.close(); });
        sheet.body.append(buttons(action("Cancel", () => sheet.close()), run));
        run.focus();
      });
    },

    progress(text, cancel) {
      const sheet = open("Running recipe", cancel);
      sheet.body.append(node("p", text));
      const stop = action("Stop", () => sheet.close());
      sheet.body.append(buttons(stop));
      stop.focus();
    },

    review({ path, before, after }) {
      return new Promise(resolve => {
        let answered = false;
        const answer = (value: boolean) => { if (answered) return; answered = true; resolve(value); };
        const sheet = open(`Review ${basename(path)}`, () => answer(false));
        if (diffFits(before, after)) {
          const view = node("div"); view.className = "ai-diff";
          for (const line of lineDiff(before, after)) {
            const row = node("div", `${line.type === "add" ? "+ " : line.type === "del" ? "- " : "  "}${line.text}`);
            row.className = `ai-diff-line ${line.type}`;
            view.append(row);
          }
          sheet.body.append(view);
        } else {
          sheet.body.append(node("p", "This note is too large to show as a diff."));
          const text = node("pre", after); text.className = "recipe-new-text"; sheet.body.append(text);
        }
        const accept = action("Accept", () => { answer(true); sheet.close(); });
        sheet.body.append(buttons(action("Cancel", () => sheet.close()), accept));
        accept.focus();
      });
    },

    done(text) {
      if (notify) { current?.detach(); notify(text); return; }
      const sheet = open("Recipe finished", () => {});
      sheet.body.append(node("p", text));
      const ok = action("OK", () => sheet.close()); sheet.body.append(buttons(ok)); ok.focus();
    },

    fail(text) {
      const sheet = open("Recipe not run", () => {});
      const message = node("p", text); message.setAttribute("role", "alert");
      sheet.body.append(message);
      const ok = action("OK", () => sheet.close()); sheet.body.append(buttons(ok)); ok.focus();
    },
  };
}
