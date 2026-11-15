// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderActions } from "../settings-screen/page-ai-actions";
import type { ScreenDeps } from "../settings-screen/screen";
import type { ActionsFile } from "../ai/actions-store";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";
function setup(initial: ActionsFile = { version: 2, actions: [] }, recipes?: unknown) {
  let file = initial;
  const host = document.createElement("div");
  const save = vi.fn(async (next: ActionsFile) => { file = next; });
  const deps = { getAISettings: () => DEFAULT_AI_SETTINGS, getClis: () => [], getModelsCache: () => ({}), onAISettingsChange: vi.fn(), actions: { getFile: () => file, hasError: () => false, save, run: vi.fn(), openFile: vi.fn(), recipes } } as unknown as ScreenDeps;
  renderActions(host, deps);
  const click = (label: string) => { const b = [...host.querySelectorAll("button")].find(b => b.textContent === label); expect(b).toBeTruthy(); b!.click(); };
  return { host, click, save, file: () => file };
}
const action = (id: string, name: string) => ({ id, name, instruction: "Translate", result: "edit" as const, input: "note" as const, engine: null, panel: true });
describe("Actions settings", () => {
  it("saves the form and renders HTML-like names as text", async () => {
    const ui = setup(); ui.click("＋ New action");
    for (const [label, value] of [["Name", "<img src=x onerror=alert(1)>"], ["Instruction", "Translate this"]]) { const input = ui.host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!; input.value = value; input.dispatchEvent(new Event("input")); }
    ui.click("Save"); await vi.waitFor(() => expect(ui.save).toHaveBeenCalledOnce());
    expect(ui.file().actions[0].name).toContain("<img"); expect(ui.host.querySelector("img")).toBeNull();
  });
  it("deletes and restores with Undo", async () => {
    const ui = setup({ version: 2, actions: [action("one", "One")] }); ui.click("Delete");
    await vi.waitFor(() => expect(ui.host.textContent).toContain("Deleted \"One\" · ")); ui.click("Undo");
    await vi.waitFor(() => expect(ui.file().actions).toHaveLength(1));
  });
  it("reorders on drag and drop", async () => {
    const ui = setup({ version: 2, actions: [action("one", "One"), action("two", "Two")] });
    const rows = ui.host.querySelectorAll('[draggable="true"]'); rows[1].dispatchEvent(new Event("dragstart")); rows[0].dispatchEvent(new Event("drop", { cancelable: true }));
    await vi.waitFor(() => expect(ui.file().actions.map(a => a.id)).toEqual(["two", "one"]));
  });
  it("moves a row down onto the next row", async () => {
    const ui = setup({ version: 2, actions: [action("one", "One"), action("two", "Two"), action("three", "Three")] });
    const rows = ui.host.querySelectorAll('[draggable="true"]'); rows[0].dispatchEvent(new Event("dragstart")); rows[1].dispatchEvent(new Event("drop", { cancelable: true }));
    await vi.waitFor(() => expect(ui.file().actions.map(a => a.id)).toEqual(["two", "one", "three"]));
  });
});

const recipeAction = (id: string, name: string) => ({ id, name, instruction: "Review", result: "answer" as const, input: "note" as const, engine: null, panel: false,
  recipe: { inputs: [{ kind: "changed" as const, days: 7 }], output: { kind: "note" as const, path: "Reviews/{{date}}.md" } } });
const mixed = (): ActionsFile => ({ version: 2, actions: [action("p1", "P1"), recipeAction("r1", "R1"), action("p2", "P2")] });
const editorDeps = (over = {}) => ({ folder: () => "/r", notes: () => ["a.md", "b.md"], pickNote: vi.fn(async () => "b.md"), views: () => [{ id: "v1", name: "Research" }], takeEdit: () => null, ...over });
const rowOf = (host: HTMLElement, name: string) => [...host.querySelectorAll<HTMLElement>(".st-row")].find(r => r.querySelector(".st-row-label")?.textContent?.includes(name))!;
const clickIn = (el: HTMLElement, label: string) => { const b = [...el.querySelectorAll("button")].find(b => b.textContent === label); expect(b, label).toBeTruthy(); b!.click(); };

describe("Actions settings with recipes", () => {
  it("keeps recipes when a plain action is deleted, moved or restored", async () => {
    const ui = setup(mixed(), editorDeps());
    clickIn(rowOf(ui.host, "P1"), "Delete");
    await vi.waitFor(() => expect(ui.file().actions.map(a => a.id)).toEqual(["r1", "p2"]));
    ui.click("Undo");
    await vi.waitFor(() => expect(ui.file().actions.map(a => a.id)).toEqual(["p1", "r1", "p2"]));
    const rows = ui.host.querySelectorAll('[draggable="true"]');
    expect(rows).toHaveLength(2);
    rows[1].dispatchEvent(new Event("dragstart")); rows[0].dispatchEvent(new Event("drop", { cancelable: true }));
    await vi.waitFor(() => expect(ui.file().actions.map(a => a.id)).toEqual(["p2", "p1", "r1"]));
  });

  it("lists recipes in their own section", () => {
    const ui = setup(mixed(), editorDeps());
    const captions = [...ui.host.querySelectorAll(".st-caption")].map(c => c.textContent);
    expect(captions).toContain("Recipes");
    const recipeRow = rowOf(ui.host, "R1");
    expect(recipeRow.dataset.setting).toBe("recipes");
    expect(recipeRow.textContent).toContain("Changed in 7 days → Reviews/{{date}}.md");
    for (const label of ["Edit", "Duplicate", "Delete"]) expect([...recipeRow.querySelectorAll("button")].map(b => b.textContent)).toContain(label);
    expect([...ui.host.querySelectorAll('[data-setting="my-actions"].st-row')].some(r => r.textContent?.includes("R1"))).toBe(false);
  });

  it("keeps offering the starter recipes once a recipe exists", () => {
    const ui = setup(mixed(), editorDeps());
    expect(ui.host.textContent).not.toContain("No recipes yet.");
    expect([...ui.host.querySelectorAll("button")].map(b => b.textContent)).toContain("＋ Weekly review");
  });

  it("saves an edited recipe without touching plain actions", async () => {
    const ui = setup(mixed(), editorDeps());
    clickIn(rowOf(ui.host, "R1"), "Edit");
    const days = ui.host.querySelector<HTMLInputElement>('[aria-label="Days"]')!;
    days.value = "14"; days.dispatchEvent(new Event("input"));
    ui.click("Save");
    await vi.waitFor(() => expect(ui.save).toHaveBeenCalled());
    const saved = ui.file().actions;
    expect(saved.map(a => a.id)).toEqual(["p1", "r1", "p2"]);
    expect(saved[1].recipe!.inputs[0]).toEqual({ kind: "changed", days: 14 });
  });

  it("builds a new recipe in the editor", async () => {
    const ui = setup({ version: 2, actions: [] }, editorDeps());
    ui.click("＋ New recipe");
    const set = (label: string, value: string) => { const el = ui.host.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!; el.value = value; el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input")); };
    set("Name", "Compare"); set("Instruction", "Compare these");
    const save = () => [...ui.host.querySelectorAll("button")].find(b => b.textContent === "Save")!;
    expect(save().disabled).toBe(true); // a note path is required
    set("Output path", "research/out.md");
    expect(save().disabled).toBe(false);
    set("Input kind", "files");
    ui.click("Add note…");
    await vi.waitFor(() => expect(ui.host.textContent).toContain("b.md"));
    ui.click("＋ Add input");
    const kinds = ui.host.querySelectorAll<HTMLSelectElement>('[aria-label="Input kind"]');
    expect(kinds).toHaveLength(2);
    kinds[1].value = "view"; kinds[1].dispatchEvent(new Event("change"));
    expect(ui.host.querySelector('[aria-label="Saved view"]')).not.toBeNull();
    set("Output", "chat");
    set("Template", "## Table");
    ui.click("Save");
    await vi.waitFor(() => expect(ui.save).toHaveBeenCalled());
    const saved = ui.file().actions[0];
    expect(saved).toMatchObject({ name: "Compare", result: "answer", input: "note", panel: false });
    expect(saved.recipe).toEqual({ inputs: [{ kind: "files", paths: ["b.md"] }, { kind: "view", viewId: "v1" }], output: { kind: "chat" }, template: "## Table" });
  });

  it("disables the file and view pickers without a folder", () => {
    const ui = setup({ version: 2, actions: [recipeAction("r1", "R1")] }, editorDeps({ folder: () => null }));
    clickIn(rowOf(ui.host, "R1"), "Edit");
    const kind = ui.host.querySelector<HTMLSelectElement>('[aria-label="Input kind"]')!;
    kind.value = "files"; kind.dispatchEvent(new Event("change"));
    expect([...ui.host.querySelectorAll("button")].find(b => b.textContent === "Add note…")!.disabled).toBe(true);
    expect(ui.host.textContent).toContain("Open a folder to choose notes.");
  });

  it("opens the editor that was asked for", () => {
    const ui = setup(mixed(), editorDeps({ takeEdit: () => ({ ...recipeAction("r1", "R1") }) }));
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="Name"]')!.value).toBe("R1");
  });
});
