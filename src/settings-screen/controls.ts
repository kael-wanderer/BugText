// Shared DOM builders for settings pages. Every user-visible string is set
// through textContent / value, never through innerHTML.

import { PAGE_LEDES, SETTINGS_PAGES, type SettingsPageId } from "./registry";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Page title (h2) and lede for a settings page. */
export function pageHeader(host: HTMLElement, page: SettingsPageId): void {
  const label = SETTINGS_PAGES.find((p) => p.id === page)?.label ?? page;
  host.append(el("h2", "st-title", label), el("p", "st-lede", PAGE_LEDES[page]));
}

/** Uppercase section caption. */
export function caption(text: string): HTMLElement {
  return el("div", "st-caption", text);
}

/** Labelled row: label + optional note on the left, control on the right. */
export function row(entryId: string, label: string, note: string | null, control: HTMLElement): HTMLElement {
  const node = el("div", "st-row");
  node.dataset.setting = entryId;
  const text = el("div", "st-row-text");
  text.append(el("strong", "st-row-label", label));
  if (note) text.append(el("p", "st-note", note));
  node.append(text, control);
  return node;
}

export type ButtonVariant = "default" | "primary" | "danger";

export function button(label: string, onClick: () => void, variant: ButtonVariant = "default"): HTMLButtonElement {
  const node = el("button", variant === "default" ? "st-btn" : `st-btn ${variant}`, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

/** Right-aligned group of controls. */
export function group(...children: HTMLElement[]): HTMLElement {
  const node = el("div", "st-btns");
  node.append(...children);
  return node;
}

export type Option<T extends string> = { value: T; label: string };

export function segmented<T extends string>(
  ariaLabel: string,
  options: ReadonlyArray<Option<T>>,
  current: T,
  onChange: (value: T) => void,
): HTMLElement {
  const node = el("span", "st-seg");
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", ariaLabel);
  for (const option of options) {
    const b = el("button", undefined, option.label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(option.value === current));
    b.addEventListener("click", () => {
      for (const other of node.querySelectorAll("button")) {
        other.setAttribute("aria-pressed", String(other === b));
      }
      if (option.value !== current) {
        current = option.value;
        onChange(option.value);
      }
    });
    node.append(b);
  }
  return node;
}

export type StepperOptions = {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Value restored by the Reset button; no Reset button when omitted. */
  resetTo?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
};

export function clampStep(value: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + delta));
}

export function stepper(options: StepperOptions): HTMLElement {
  const { ariaLabel, min, max, step = 1, unit, resetTo, format = String, onChange } = options;
  let value = options.value;
  const node = el("span", "st-stepper");
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", ariaLabel);
  const minus = el("button", "st-sq", "−");
  minus.type = "button";
  minus.setAttribute("aria-label", `Decrease ${ariaLabel}`);
  const plus = el("button", "st-sq", "+");
  plus.type = "button";
  plus.setAttribute("aria-label", `Increase ${ariaLabel}`);
  const display = el("output", "st-val");
  display.setAttribute("aria-live", "polite");
  const show = (): void => {
    display.textContent = format(value);
    minus.disabled = value <= min;
    plus.disabled = value >= max;
  };
  const set = (next: number): void => {
    if (next === value) return;
    value = next;
    show();
    onChange(value);
  };
  minus.addEventListener("click", () => set(clampStep(value, -step, min, max)));
  plus.addEventListener("click", () => set(clampStep(value, step, min, max)));
  node.append(minus, display, plus);
  if (unit) node.append(el("span", "st-unit", unit));
  if (resetTo !== undefined) node.append(button("Reset", () => set(resetTo)));
  show();
  return node;
}

export function toggle(ariaLabel: string, checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement {
  const node = el("input", "st-switch");
  node.type = "checkbox";
  node.setAttribute("role", "switch");
  node.setAttribute("aria-label", ariaLabel);
  node.checked = checked;
  node.addEventListener("change", () => onChange(node.checked));
  return node;
}

export function select<T extends string>(
  ariaLabel: string,
  options: ReadonlyArray<Option<T>>,
  current: T,
  onChange: (value: T) => void,
): HTMLSelectElement {
  const node = el("select", "st-select");
  node.setAttribute("aria-label", ariaLabel);
  for (const option of options) {
    const item = el("option", undefined, option.label);
    item.value = option.value;
    node.append(item);
  }
  node.value = current;
  node.addEventListener("change", () => onChange(node.value as T));
  return node;
}

export function textInput(ariaLabel: string, value: string, placeholder = ""): HTMLInputElement {
  const node = el("input", "st-text");
  node.type = "text";
  node.setAttribute("aria-label", ariaLabel);
  node.spellcheck = false;
  node.placeholder = placeholder;
  node.value = value;
  return node;
}
