// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderActions } from "../settings-screen/page-ai-actions";
import type { ScreenDeps } from "../settings-screen/screen";
import type { ActionsFile } from "../ai/actions-store";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";
function setup(initial: ActionsFile = { version: 1, actions: [] }) {
  let file = initial;
  const host = document.createElement("div");
  const save = vi.fn(async (next: ActionsFile) => { file = next; });
  const deps = { getAISettings: () => DEFAULT_AI_SETTINGS, getClis: () => [], getModelsCache: () => ({}), onAISettingsChange: vi.fn(), actions: { getFile: () => file, hasError: () => false, save, run: vi.fn(), openFile: vi.fn() } } as unknown as ScreenDeps;
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
    const ui = setup({ version: 1, actions: [action("one", "One")] }); ui.click("Delete");
    await vi.waitFor(() => expect(ui.host.textContent).toContain("Deleted")); ui.click("Undo");
    await vi.waitFor(() => expect(ui.file().actions).toHaveLength(1));
  });
  it("reorders on drag and drop", async () => {
    const ui = setup({ version: 1, actions: [action("one", "One"), action("two", "Two")] });
    const rows = ui.host.querySelectorAll('[draggable="true"]'); rows[1].dispatchEvent(new Event("dragstart")); rows[0].dispatchEvent(new Event("drop", { cancelable: true }));
    await vi.waitFor(() => expect(ui.file().actions.map(a => a.id)).toEqual(["two", "one"]));
  });
});
