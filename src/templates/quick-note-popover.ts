// Quick Note popover. Text goes in and out through .value / textContent only.

import { resolveTarget, addQuickNote, type QuickNoteDeps, type QuickTarget } from "./quick-note";

export type PopoverDeps = {
  host: HTMLElement;
  /** Builds the note deps; null when no folder is open. */
  noteDeps: () => QuickNoteDeps | null;
  onAdded: (path: string) => void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function showQuickNote(deps: PopoverDeps): Promise<void> {
  const existing = deps.host.querySelector<HTMLElement>(".qn");
  if (existing) { existing.querySelector("textarea")?.focus(); return; }
  const note = deps.noteDeps();
  if (!note) return;

  const previous = document.activeElement as HTMLElement | null;
  const pop = el("div", "qn");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Quick Note");
  const input = el("textarea", "qn-input");
  input.rows = 1;
  input.placeholder = "Add a note…";
  input.setAttribute("aria-label", "Add a note");
  const info = el("div", "qn-info");
  const target = el("span", "qn-target", "→ …");
  info.append(target, el("span", "qn-hints", "Enter add · ⇧Enter new line · Esc close"));
  pop.append(input, info);
  deps.host.append(pop);

  let closed = false;
  const close = (restoreFocus: boolean): void => {
    if (closed) return;
    closed = true;
    pop.remove();
    if (restoreFocus) previous?.focus();
  };
  const fail = (message: string): void => { target.textContent = message; target.classList.add("err"); };

  let resolved: QuickTarget | null = null;
  const resolution = resolveTarget(note).then((result) => {
    if ("error" in result) { fail(result.error); return; }
    resolved = result;
    target.textContent = `→ ${result.relative}`;
  }).catch(() => fail("Could not read the Daily log template."));

  let busy = false;
  const submit = async (): Promise<void> => {
    const text = input.value;
    if (!text.trim() || busy) return;
    await resolution;
    const current = deps.noteDeps();
    if (!resolved || !current) return;
    busy = true;
    try {
      const path = await addQuickNote(current, text, resolved);
      input.value = "";
      input.rows = 1;
      target.classList.remove("err");
      deps.onAdded(path);
    } catch (error) {
      fail(typeof error === "string" && error ? error : "Could not add the note.");
    }
    busy = false;
    if (!closed) input.focus();
  };

  input.addEventListener("input", () => { input.rows = Math.min(5, input.value.split("\n").length); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void submit(); }
  });
  pop.addEventListener("focusout", (event) => {
    if (!pop.contains(event.relatedTarget as Node | null)) close(false);
  });
  input.focus();
}
