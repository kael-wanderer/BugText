// DOM builders shared by the AI page sections: bordered lists, inline forms,
// tags, and a redraw that keeps keyboard focus. User strings go through
// textContent / value only.

import type { AISettings } from "../ai/aisettings";
import { cloneAISettings } from "./ai-helpers";
import { button } from "./controls";
import type { ScreenDeps } from "./screen";

/** Clone, mutate, save agent.json through the screen deps. */
export function updateAI(deps: ScreenDeps, mutate: (next: AISettings) => void): AISettings {
  const next = cloneAISettings(deps.getAISettings());
  mutate(next);
  deps.onAISettingsChange(next);
  return next;
}

/** Marks a control so a redraw can put focus back on its replacement. */
export function focusKey<T extends HTMLElement>(node: T, key: string): T {
  node.dataset.focus = key;
  return node;
}

/**
 * Rebuilds `container` and restores focus: the same keyed control if it still
 * exists, else the first button of the same list item, else the container.
 */
export function redrawKeepingFocus(container: HTMLElement, draw: () => void): void {
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && container.contains(active);
  const key = inside
    ? (active.dataset.focus ?? active.closest<HTMLElement>("[data-focus-return]")?.dataset.focusReturn)
    : undefined;
  const item = inside ? active.closest<HTMLElement>("[data-item]")?.dataset.item : undefined;
  draw();
  if (!inside) return;
  const target =
    (key ? container.querySelector<HTMLElement>(`[data-focus="${CSS.escape(key)}"]`) : null) ??
    (item ? container.querySelector<HTMLElement>(`[data-item="${CSS.escape(item)}"] button`) : null);
  if (target) target.focus({ preventScroll: true });
  else {
    container.tabIndex = -1;
    container.focus({ preventScroll: true });
  }
}

export function tag(text: string, variant?: "ok"): HTMLElement {
  const node = document.createElement("span");
  node.className = variant ? `st-tag ${variant}` : "st-tag";
  node.textContent = text;
  return node;
}

export function list(entryId: string): HTMLElement {
  const node = document.createElement("div");
  node.className = "st-list";
  node.dataset.setting = entryId;
  return node;
}

export function emptyItem(text: string): HTMLElement {
  const node = document.createElement("p");
  node.className = "st-li st-li-empty";
  node.textContent = text;
  return node;
}

/** List row: name + tags + code line on the left, buttons on the right. */
export function listItem(
  itemKey: string,
  name: string,
  tags: HTMLElement[],
  code: string,
  buttons: HTMLElement[],
): HTMLElement {
  const node = document.createElement("div");
  node.className = "st-li";
  node.dataset.item = itemKey;
  const text = document.createElement("div");
  text.className = "st-li-text";
  const title = document.createElement("div");
  title.className = "st-li-name";
  const label = document.createElement("span");
  label.textContent = name;
  title.append(label, ...tags);
  const detail = document.createElement("code");
  detail.textContent = code;
  text.append(title, detail);
  const actions = document.createElement("div");
  actions.className = "st-btns";
  actions.append(...buttons);
  node.append(text, actions);
  return node;
}

export type FieldSpec = {
  label: string;
  name: string;
  value?: string;
  placeholder?: string;
  type?: "text" | "password" | "url";
  required?: boolean;
};

export type FormSpec = {
  className?: string;
  fields: FieldSpec[];
  submitLabel: string;
  onSubmit: (data: Record<string, string>) => void;
  onCancel: () => void;
};

/** Inline form (Enter submits, Cancel closes). Values are trimmed. */
export function inlineForm(spec: FormSpec): HTMLFormElement {
  const form = document.createElement("form");
  form.className = spec.className ? `st-form ${spec.className}` : "st-form";
  const inputs: HTMLInputElement[] = [];
  for (const field of spec.fields) {
    const label = document.createElement("label");
    label.className = "st-field";
    const caption = document.createElement("span");
    caption.textContent = field.label;
    const input = document.createElement("input");
    input.className = "st-text";
    input.type = field.type ?? "text";
    input.name = field.name;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.required = field.required ?? false;
    input.placeholder = field.placeholder ?? "";
    input.value = field.value ?? "";
    label.append(caption, input);
    form.append(label);
    inputs.push(input);
  }
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "st-btn primary";
  submit.textContent = spec.submitLabel;
  const cancel = button("Cancel", spec.onCancel);
  const actions = document.createElement("div");
  actions.className = "st-btns st-form-actions";
  actions.append(cancel, submit);
  form.append(actions);
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault(); // the settings screen ignores handled Esc presses
    spec.onCancel();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data: Record<string, string> = {};
    for (const input of inputs) data[input.name] = input.value.trim();
    spec.onSubmit(data);
  });
  return form;
}

/** "+ Add …" button that swaps itself for a form until submit or cancel. */
export function addSection(label: string, key: string, makeForm: (close: () => void) => HTMLElement): HTMLElement {
  const holder = document.createElement("div");
  holder.className = "st-add";
  holder.dataset.focusReturn = key; // after submit, focus returns to the Add button
  const show = (): void => {
    const open = focusKey(button(label, () => {
      const form = makeForm(() => {
        show();
        holder.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
      });
      holder.replaceChildren(form);
      form.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
    }), key);
    holder.replaceChildren(open);
  };
  show();
  return holder;
}
