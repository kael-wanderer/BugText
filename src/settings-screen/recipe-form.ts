/** Settings ▸ AI ▸ Actions: the recipe editor (spec 5.3). All text by textContent / .value. */
import { validRecipe, type Recipe, type RecipeInput, type SavedAction } from "../ai/actions-store";
import { button, group, row, select } from "./controls";

export type RecipeEditorDeps = {
  folder(): string | null;
  notes(): string[]; // the folder's notes, relative to it
  pickNote(files: string[]): Promise<string | null>;
  views(): { id: string; name: string }[];
  /** A recipe the editor should open with (from the Recipes sheet or a failed run), once. */
  takeEdit(): SavedAction | null;
};
export type RecipeDraft = SavedAction & { recipe: Recipe };

const KINDS: { value: RecipeInput["kind"]; label: string }[] = [
  { value: "current-note", label: "Current note" },
  { value: "files", label: "Selected files" },
  { value: "glob", label: "Notes in a folder" },
  { value: "view", label: "Saved view" },
  { value: "changed", label: "Changed in the last N days" },
  { value: "completed-tasks", label: "Completed tasks in the last N days" },
];
const NO_FOLDER = "Open a folder to choose notes.";

export function freshRecipe(): RecipeDraft {
  return { id: crypto.randomUUID(), name: "", instruction: "", result: "answer", input: "note", engine: null, panel: false,
    recipe: { inputs: [{ kind: "current-note" }], output: { kind: "note", path: "" } } };
}

function text(label: string, value: string, change: (value: string) => void, area = false): HTMLInputElement | HTMLTextAreaElement {
  const input = document.createElement(area ? "textarea" : "input"); input.className = "st-text";
  input.value = value; input.setAttribute("aria-label", label);
  input.addEventListener("input", () => change(input.value));
  return input;
}

/**
 * Draws the recipe fields of `draft` into `form`. `changed` runs after every edit so the caller can
 * enable Save; `engine` appends the shared engine rows.
 */
export function recipeFields(form: HTMLElement, draft: RecipeDraft, deps: RecipeEditorDeps | undefined, changed: () => void): void {
  const recipe = draft.recipe;
  const box = document.createElement("div"); box.className = "st-recipe-fields";
  form.append(box);
  const folder = deps?.folder() ?? null;

  function inputControls(input: RecipeInput, index: number): HTMLElement {
    const controls = document.createElement("div"); controls.className = "st-recipe-input";
    controls.append(select("Input kind", KINDS, input.kind, kind => {
      recipe.inputs[index] = kind === "files" ? { kind, paths: [] } : kind === "glob" ? { kind, folder: "", glob: "**/*.md" } :
        kind === "view" ? { kind, viewId: deps?.views()[0]?.id ?? "" } : kind === "changed" || kind === "completed-tasks" ? { kind, days: 7 } : { kind };
      paint();
    }));
    if (input.kind === "changed" || input.kind === "completed-tasks") {
      const days = text("Days", String(input.days), value => { input.days = Number(value); changed(); }) as HTMLInputElement;
      days.type = "number"; days.min = "1"; days.max = "365"; controls.append(days);
    } else if (input.kind === "glob") {
      controls.append(text("Folder", input.folder, value => { input.folder = value.trim(); changed(); }), text("Glob", input.glob, value => { input.glob = value.trim(); changed(); }));
    } else if (input.kind === "files") {
      const list = document.createElement("ul"); list.className = "st-recipe-files";
      input.paths.forEach((path, i) => {
        const li = document.createElement("li"); li.append(document.createTextNode(path), button("Remove", () => { input.paths.splice(i, 1); paint(); }));
        list.append(li);
      });
      const add = button("Add note…", () => {
        if (!deps || !folder) return;
        const notes = deps.notes();
        void deps.pickNote(notes).then(picked => {
          if (!picked || !notes.includes(picked)) return;
          if (!input.paths.includes(picked) && input.paths.length < 50) input.paths.push(picked);
          paint();
        });
      });
      add.disabled = !folder || !deps;
      controls.append(list, add);
      if (!folder) controls.append(Object.assign(document.createElement("p"), { className: "st-note", textContent: NO_FOLDER }));
    } else if (input.kind === "view") {
      const views = deps?.views() ?? [];
      const options = [...views.map(v => ({ value: v.id, label: v.name }))];
      if (input.viewId && !views.some(v => v.id === input.viewId)) options.push({ value: input.viewId, label: "Missing view" });
      if (!options.length) options.push({ value: "", label: "No saved views" });
      const picker = select("Saved view", options, input.viewId, value => { input.viewId = value; changed(); });
      picker.disabled = !folder;
      controls.append(picker);
      if (!folder) controls.append(Object.assign(document.createElement("p"), { className: "st-note", textContent: NO_FOLDER }));
    }
    if (recipe.inputs.length > 1) controls.append(button("Remove input", () => { recipe.inputs.splice(index, 1); paint(); }));
    return controls;
  }

  function paint(): void {
    box.replaceChildren();
    recipe.inputs.forEach((input, index) => box.append(row("recipes", index === 0 ? "Inputs" : "", null, inputControls(input, index))));
    if (recipe.inputs.length < 6) box.append(group(button("＋ Add input", () => { recipe.inputs.push({ kind: "changed", days: 7 }); paint(); })));
    const output = document.createElement("div"); output.className = "st-recipe-output";
    output.append(select("Output", [{ value: "note", label: "Note" }, { value: "chat", label: "Chat" }, { value: "properties", label: "Properties of the current note" }], recipe.output.kind, kind => {
      recipe.output = kind === "note" ? { kind, path: "" } : { kind };
      paint();
    }));
    if (recipe.output.kind === "note") {
      const out = recipe.output;
      output.append(text("Output path", out.path, value => { out.path = value.trim(); changed(); }));
    }
    box.append(row("recipes", "Output", "Placeholders: {{date}} {{year}} {{month}} {{day}} {{week}} {{title}} {{dir}}", output));
    box.append(row("recipes", "Template (optional)", null, text("Template", recipe.template ?? "", value => {
      if (value) recipe.template = value; else delete recipe.template;
      changed();
    }, true)));
    changed();
  }
  paint();
}

export const recipeValid = (draft: RecipeDraft): boolean => validRecipe(draft.recipe);
