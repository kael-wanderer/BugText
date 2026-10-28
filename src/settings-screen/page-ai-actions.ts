import type { ActionsFile, SavedAction } from "../ai/actions-store";
import { parseActions } from "../ai/actions-store";
import { QUICK_ACTIONS } from "../ai/quick-actions";
import { engineKey, engineOptions, effortLevels, modelOptions } from "../ai/engines";
import type { ScreenDeps } from "./screen";
import { button, caption, row, toggle, select, group } from "./controls";
export type ActionsPageDeps = {
  getFile(): ActionsFile;
  hasError(): boolean;
  save(file: ActionsFile): Promise<void>;
  run(action: SavedAction): void;
  openFile(): void;
};
export function renderActions(host: HTMLElement, deps: ScreenDeps): void {
  const api = deps.actions;
  if (!api) return;
  const page = document.createElement("div"); host.append(page);
  let draft: SavedAction | null = null;
  let dragged = "";
  let deleted: { action: SavedAction; index: number } | null = null;
  const notice = document.createElement("div"); notice.className = "st-action-notice"; notice.setAttribute("role", "status");
  async function persist(actions: SavedAction[]): Promise<void> {
    try { await api!.save({ ...api!.getFile(), actions }); draw(); }
    catch (e) { notice.textContent = e instanceof Error ? e.message : "Could not save actions"; }
  }
  function fresh(name = "", instruction = "", result: SavedAction["result"] = "edit"): SavedAction {
    return { id: crypto.randomUUID(), name, instruction, result, input: "selection-or-note", engine: null, panel: true };
  }
  function draw(): void {
    page.replaceChildren(caption("Built-in"));
    for (const a of QUICK_ACTIONS) page.append(row(`action-${a.feature}`, a.label, a.kind === "edit" ? "Edit (review)" : "Answer in Chat", toggle(a.label, deps.getAISettings().enabled[a.feature], value => {
      const next = structuredClone(deps.getAISettings()); next.enabled[a.feature] = value; deps.onAISettingsChange(next);
    })));
    page.append(caption("My actions")); page.dataset.setting = "my-actions";
    if (api!.hasError()) { const warning = document.createElement("p"); warning.textContent = "ai-actions.json could not be read. Built-in actions still work; your file was not changed."; page.append(warning, button("Open file", api!.openFile)); }
    const actions = api!.getFile().actions;
    for (const a of actions) {
      const item = row("my-actions", a.name, `${a.result === "edit" ? "Edit" : "Answer"} · ${a.input === "note" ? "whole note" : "selection, else whole note"} · ${a.engine ? engineKey(a.engine.engine) : "Same as Chat"}${a.panel ? " · in panel" : ""}`, group(
        button("Edit", () => { draft = structuredClone(a); draw(); }),
        button("Duplicate", () => { draft = { ...structuredClone(a), id: crypto.randomUUID(), name: `${a.name.slice(0, 50)} copy` }; draw(); }),
        button("Delete", () => { deleted = { action: a, index: actions.indexOf(a) }; void persist(actions.filter(x => x.id !== a.id)); }),
      ));
      const grip = document.createElement("span"); grip.textContent = "⋮⋮"; grip.setAttribute("aria-hidden", "true"); item.prepend(grip);
      item.draggable = true; item.setAttribute("aria-label", `Reorder ${a.name}`);
      item.addEventListener("dragstart", () => { dragged = a.id; });
      item.addEventListener("dragover", e => e.preventDefault());
      item.addEventListener("drop", e => { e.preventDefault(); const next = [...actions]; const from = next.findIndex(x => x.id === dragged); if (from < 0) return; const to = next.findIndex(x => x.id === a.id); const [moved] = next.splice(from, 1); next.splice(to, 0, moved); void persist(next); });
      page.append(item);
    }
    if (!actions.length) {
      const empty = document.createElement("p"); empty.textContent = "No actions yet. Save a prompt you use often. Start from one of these:"; page.append(empty);
      for (const [name, instruction, result] of [["Translate to English", "Translate the text to English. Preserve Markdown formatting. Output only the translation.", "edit"], ["Formal tone", "Rewrite the text in a formal tone. Preserve meaning and Markdown formatting.", "edit"], ["Extract action items", "List every action item as a Markdown task list, including owners when named. Output only the list.", "answer"]] as const) page.append(button(`＋ ${name}`, () => { draft = fresh(name, instruction, result); draw(); }));
    }
    page.append(button("＋ New action", () => { draft = fresh(); draw(); }));
    if (draft) form(draft);
    notice.replaceChildren();
    if (deleted) notice.append(document.createTextNode("Deleted · "), button("Undo", () => { const next = [...api!.getFile().actions]; next.splice(deleted!.index, 0, deleted!.action); deleted = null; void persist(next); }));
    page.append(notice);
  }
  function form(a: SavedAction): void {
    const form = document.createElement("div"); form.className = "st-action-form";
    function field(label: string, key: "name" | "instruction"): void {
      const input = document.createElement(key === "instruction" ? "textarea" : "input"); input.className = "st-text"; input.value = a[key]; input.maxLength = key === "name" ? 60 : 8000; input.setAttribute("aria-label", label); input.addEventListener("input", () => { a[key] = input.value; }); form.append(row("my-actions", label, null, input));
    }
    field("Name", "name"); field("Instruction", "instruction");
    form.append(row("my-actions", "Result", null, select("Result", [{ value: "edit", label: "Edit (review)" }, { value: "answer", label: "Answer in Chat" }], a.result, value => { a.result = value; })));
    form.append(row("my-actions", "Input", null, select("Input", [{ value: "selection-or-note", label: "Selection, else whole note" }, { value: "note", label: "Whole note" }], a.input, value => { a.input = value; })));
    const choices = engineOptions(deps.getAISettings(), deps.getClis(), a.engine?.engine ?? { kind: "none" });
    form.append(row("my-actions", "Engine", null, select("Engine", [{ value: "chat", label: "Same as Chat" }, ...choices], a.engine ? engineKey(a.engine.engine) : "chat", value => { a.engine = value === "chat" ? null : { engine: choices.find(x => x.value === value)!.engine, model: "", effort: "" }; draw(); })));
    if (a.engine) {
      const engine = a.engine;
      form.append(row("my-actions", "Model", null, select("Model", modelOptions(engine.engine, deps.getAISettings(), deps.getClis(), deps.getModelsCache(), engine.model).filter(x => x.value !== "__custom"), engine.model, value => { engine.model = value; })));
      const custom = document.createElement("input"); custom.className = "st-text"; custom.value = engine.model; custom.setAttribute("aria-label", "Custom model"); custom.addEventListener("input", () => { engine.model = custom.value; }); form.append(custom);
      const levels = effortLevels(engine.engine); if (levels.length) form.append(row("my-actions", "Effort", null, select("Effort", [{ value: "", label: "Default" }, ...levels.map(value => ({ value, label: value }))], engine.effort, value => { engine.effort = value; })));
    }
    form.append(row("my-actions", "Show in AI panel", null, toggle("Show in AI panel", a.panel, value => { a.panel = value; })));
    function validated(): SavedAction[] | null {
      const next = api!.getFile().actions.filter(x => x.id !== a.id); const index = api!.getFile().actions.findIndex(x => x.id === a.id); next.splice(index < 0 ? next.length : index, 0, a);
      if (!parseActions(JSON.stringify({ version: 1, actions: next }))) { notice.textContent = "Enter a unique name (up to 60 characters) and an instruction (up to 8,000 characters)."; return null; } return next;
    }
    form.append(group(button("Try on selection", () => { if (validated()) api!.run(a); }), button("Cancel", () => { draft = null; draw(); }), button("Save", () => { const next = validated(); if (next) { draft = null; void persist(next); } }, "primary"))); page.append(form);
  }
  draw();
}
