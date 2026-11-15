/** The Recipes sheet: each recipe with what it does, its status and Run (spec 5.4). */
import type { Recipe, RecipeInput, SavedAction } from "../ai/actions-store";
import { action, node, organizeSheet } from "../notes/sheet";
import type { RunRecord } from "./runs";
import { STARTER_RECIPES, type StarterRecipe } from "./starters";

function inputLabel(input: RecipeInput): string {
  switch (input.kind) {
    case "current-note": return "Current note";
    case "files": return "Selected files";
    case "glob": return `Notes matching ${input.folder ? `${input.folder.replace(/\/$/, "")}/` : ""}${input.glob}`;
    case "view": return "Saved view";
    case "changed": return `Changed in ${input.days} days`;
    case "completed-tasks": return `Completed tasks in ${input.days} days`;
  }
}

/** "Changed in 7 days + completed tasks → Reviews/{{year}}-W{{week}}.md" */
export function describeRecipe(recipe: Recipe): string {
  const inputs = recipe.inputs.map((input, i) => {
    // Completed tasks over the same days as a "changed" input before it need no second range.
    const label = input.kind === "completed-tasks" && recipe.inputs.some(o => o.kind === "changed" && o.days === input.days) ? "Completed tasks" : inputLabel(input);
    return i === 0 ? label : label[0].toLowerCase() + label.slice(1);
  }).join(" + ");
  const output = recipe.output.kind === "chat" ? "Chat" : recipe.output.kind === "properties" ? "properties as a diff" : recipe.output.path;
  return `${inputs} → ${output}`;
}

export function statusText(recipe: Recipe, last: RunRecord | undefined, changed: number): string {
  if (!last) return "Never run";
  if (recipe.inputs.some(i => i.kind === "current-note")) {
    const at = new Date(last.at);
    return Number.isNaN(at.getTime()) ? "Run before" : `Last run ${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  }
  if (!changed) return "Up to date";
  return `${changed} ${changed === 1 ? "source" : "sources"} changed since last run`;
}

export function openRecipes(host: HTMLElement, deps: {
  recipes: () => (SavedAction & { recipe: Recipe })[];
  status: (a: SavedAction) => Promise<string>;
  run: (a: SavedAction) => void;
  newRecipe: (starter?: StarterRecipe) => void;
}): void {
  const sheet = organizeSheet(host, "Recipes");
  sheet.body.classList.add("recipe-sheet");
  const list = node("ul"); list.className = "recipe-list";
  const recipes = deps.recipes();
  for (const recipe of recipes) {
    const li = node("li");
    const text = node("div");
    const status = node("span"); status.className = "recipe-status";
    text.append(node("strong", recipe.name), node("div", describeRecipe(recipe.recipe)), status);
    li.append(text, action("Run", () => { sheet.close(); deps.run(recipe); }));
    list.append(li);
    void deps.status(recipe).then(value => { status.textContent = value; }, () => {});
  }
  if (recipes.length) sheet.body.append(list);
  else sheet.body.append(node("p", "No recipes yet."));
  for (const starter of STARTER_RECIPES) sheet.body.append(action(`＋ ${starter.name}`, () => { sheet.close(); deps.newRecipe(starter); }));
  const create = action("New Recipe…", () => { sheet.close(); deps.newRecipe(); });
  const row = node("div"); row.className = "organize-actions"; row.append(create); sheet.body.append(row);
  (list.querySelector("button") ?? create).focus();
}
