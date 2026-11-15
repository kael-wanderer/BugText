// The Save excerpt / Save task / Add note sheet (spec 3.2, 3.3, 3.6; mockup screen 4).
// Every owner or note string goes in with textContent or .value.

import type { CaptureTarget } from "../settings";

export type SheetInput = {
  kind: "excerpt" | "task" | "note";
  quote: string;
  label: string;
  target: CaptureTarget;
  targetHint: (target: CaptureTarget) => string;
  chooseNote: () => Promise<string | null>;
};
export type SheetResult = { comment: string; text: string; target: CaptureTarget } | null;

const TITLES = { excerpt: "Save excerpt", task: "Save task", note: "Add note" } as const;
const CHOICES: [CaptureTarget["kind"], string][] = [["companion", "Companion note"], ["daily", "Daily note"], ["note", "Choose Note…"]];

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function showCaptureSheet(doc: Document, input: SheetInput): Promise<SheetResult> {
  return new Promise((resolve) => {
    const overlay = el(doc, "div", "capture-sheet-overlay");
    const form = el(doc, "form", "capture-sheet");
    form.setAttribute("aria-label", TITLES[input.kind]);
    const finish = (result: SheetResult): void => { overlay.remove(); resolve(result); };

    form.append(el(doc, "h2", undefined, TITLES[input.kind]));
    let taskField: HTMLInputElement | null = null;
    if (input.kind === "excerpt") form.append(el(doc, "blockquote", "capture-quote", input.quote));
    if (input.kind === "task") {
      const label = el(doc, "label", undefined, "Task");
      taskField = el(doc, "input", "capture-task");
      taskField.value = input.quote.replace(/\s+/g, " ").trim();
      label.append(taskField);
      form.append(label);
    }
    form.append(el(doc, "p", "capture-source", input.label));

    const commentLabel = el(doc, "label", undefined, "Your comment (optional)");
    const comment = el(doc, "textarea", "capture-comment");
    comment.rows = 3;
    commentLabel.append(comment);
    form.append(commentLabel);

    let target = input.target;
    const hint = el(doc, "p", "capture-hint");
    if (input.kind !== "note") {
      const group = el(doc, "fieldset", "capture-targets");
      group.append(el(doc, "legend", undefined, "Save to"));
      const radios = new Map<string, HTMLInputElement>();
      const sync = (): void => {
        radios.forEach((radio, kind) => { radio.checked = kind === target.kind; });
        hint.textContent = input.targetHint(target);
      };
      for (const [kind, label] of CHOICES) {
        const option = el(doc, "label");
        const radio = el(doc, "input");
        radio.type = "radio";
        radio.name = "capture-target";
        radio.value = kind;
        radios.set(kind, radio);
        radio.addEventListener("click", () => {
          if (kind !== "note") { target = { kind } as CaptureTarget; sync(); return; }
          sync(); // keep the old choice shown until a note is picked
          void input.chooseNote().then((picked) => {
            if (picked) target = { kind: "note", relative: picked };
            sync();
          });
        });
        option.append(radio, doc.createTextNode(` ${label}`));
        group.append(option);
      }
      form.append(group, hint);
      sync();
    }

    const error = el(doc, "p", "capture-error");
    error.setAttribute("role", "alert");
    const actions = el(doc, "div", "capture-actions");
    const cancel = el(doc, "button", "capture-cancel", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => finish(null));
    const submit = el(doc, "button", "capture-save", "Save");
    submit.type = "submit";
    actions.append(cancel, submit);
    form.append(error, actions);
    taskField?.addEventListener("input", () => { error.textContent = ""; });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = taskField ? taskField.value.replace(/\s+/g, " ").trim() : input.quote;
      if (input.kind === "task" && !text) { error.textContent = "Write the task first."; taskField?.focus(); return; }
      finish({ comment: comment.value.trim(), text, target });
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.stopPropagation(); finish(null); }
    });
    overlay.append(form);
    doc.body.append(overlay);
    (taskField ?? comment).focus();
  });
}
