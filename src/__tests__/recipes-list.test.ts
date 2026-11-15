// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeRecipe, openRecipes, statusText } from "../recipes/list";
import { STARTER_RECIPES } from "../recipes/starters";
import type { Recipe, SavedAction } from "../ai/actions-store";
import { parseActions } from "../ai/actions-store";

let host: HTMLElement;
beforeEach(() => { document.body.replaceChildren(); host = document.createElement("div"); document.body.append(host); });
const recipe = (r: Recipe, name = "R"): SavedAction & { recipe: Recipe } =>
  ({ id: name, name, instruction: "Do", result: "answer", input: "note", engine: null, panel: false, recipe: r });

describe("starters", () => {
  it("are four valid recipes with fixed fields", () => {
    expect(STARTER_RECIPES.map(s => s.name)).toEqual(["Meeting notes → decisions, questions, tasks", "Compare reports against my criteria", "Weekly review", "File this note"]);
    for (const s of STARTER_RECIPES) {
      expect(s).toMatchObject({ result: "answer", input: "note", panel: false, engine: null });
      expect(parseActions(JSON.stringify({ version: 2, actions: [{ ...s, id: "x" }] })), s.name).not.toBeNull();
    }
  });
});

describe("describeRecipe", () => {
  it("summarises inputs and output", () => {
    expect(STARTER_RECIPES.map(s => describeRecipe(s.recipe!))).toEqual([
      "Current note → {{dir}}/{{title}} summary.md",
      "Selected files → research/comparison.md",
      "Changed in 7 days + completed tasks → Reviews/{{year}}-W{{week}}.md",
      "Current note → properties as a diff",
    ]);
    expect(describeRecipe({ inputs: [{ kind: "glob", folder: "research", glob: "*.md" }, { kind: "view", viewId: "v" }], output: { kind: "chat" } }))
      .toBe("Notes matching research/*.md + saved view → Chat");
  });
});

describe("statusText", () => {
  const last = { at: "2026-11-12T02:05:00.000Z", output: null, sources: {} };
  const changed: Recipe = { inputs: [{ kind: "changed", days: 7 }], output: { kind: "chat" } };
  const current: Recipe = { inputs: [{ kind: "current-note" }], output: { kind: "chat" } };
  it("maps counts to text", () => {
    expect(statusText(changed, undefined, 3)).toBe("Never run");
    expect(statusText(changed, last, 0)).toBe("Up to date");
    expect(statusText(changed, last, 1)).toBe("1 source changed since last run");
    expect(statusText(changed, last, 4)).toBe("4 sources changed since last run");
  });
  it("shows no count for a current-note recipe", () => {
    expect(statusText(current, undefined, 2)).toBe("Never run");
    expect(statusText(current, last, 2)).toMatch(/^Last run 12 Nov$/);
  });
});

describe("Recipes sheet", () => {
  it("lists recipes with status and Run", async () => {
    const run = vi.fn(), newRecipe = vi.fn();
    const weekly = recipe(STARTER_RECIPES[2].recipe!, "Weekly review");
    openRecipes(host, { recipes: () => [weekly], status: async () => "4 sources changed since last run", run, newRecipe });
    expect(host.textContent).toContain("Weekly review");
    expect(host.textContent).toContain("Changed in 7 days + completed tasks → Reviews/{{year}}-W{{week}}.md");
    await vi.waitFor(() => expect(host.textContent).toContain("4 sources changed since last run"));
    [...host.querySelectorAll("button")].find(b => b.textContent === "Run")!.click();
    expect(run).toHaveBeenCalledWith(weekly);
    expect(host.querySelector(".organize-scrim")).toBeNull();
  });

  it("offers New Recipe… and the starters when empty", () => {
    const newRecipe = vi.fn();
    openRecipes(host, { recipes: () => [], status: async () => "", run: vi.fn(), newRecipe });
    expect(host.textContent).toContain("No recipes yet.");
    const labels = [...host.querySelectorAll("button")].map(b => b.textContent);
    for (const s of STARTER_RECIPES) expect(labels).toContain(`＋ ${s.name}`);
    [...host.querySelectorAll("button")].find(b => b.textContent === "＋ Weekly review")!.click();
    expect(newRecipe).toHaveBeenCalledWith(STARTER_RECIPES[2]);
    openRecipes(host, { recipes: () => [], status: async () => "", run: vi.fn(), newRecipe });
    [...host.querySelectorAll("button")].find(b => b.textContent === "New Recipe…")!.click();
    expect(newRecipe).toHaveBeenLastCalledWith();
  });

  it("renders names as text", () => {
    openRecipes(host, { recipes: () => [recipe(STARTER_RECIPES[0].recipe!, "<img src=x onerror=alert(1)>")], status: async () => "<img src=y>", run: vi.fn(), newRecipe: vi.fn() });
    expect(host.querySelector("img")).toBeNull();
  });
});
