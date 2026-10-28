// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createWorkspaceController } from "../workspaces/controller";
import { showSaveWorkspaceSheet } from "../workspaces/save-sheet";
import { missingStrip } from "../workspaces/missing-strip";
import { sessionLayout } from "../workspaces/layout";
import { freshState } from "../state";
import type { WorkspacesIO } from "../workspaces/store";

function fixture() {
  let contents: string | null = null;
  const io: WorkspacesIO = { read: async () => contents, write: async value => { contents = value; }, broadcast: () => {} };
  const layout = sessionLayout(freshState());
  const tabs = ["unsaved"];
  const controller = createWorkspaceController({ io, capture: () => ({ folder: "/notes", layout }), claim: async () => null, release: async () => {}, display: () => {} });
  return { io, controller, tabs, get: () => contents, set: (value: string) => { contents = value; } };
}
async function tick() { await new Promise(resolve => setTimeout(resolve, 10)); }
describe("workspace saving", () => {
  it("shows duplicate name errors in the sheet", async () => {
    const f = fixture(); await f.controller.save("Notes", false);
    showSaveWorkspaceSheet("/notes", f.controller.save);
    document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await tick();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("already exists"); document.body.replaceChildren();
  });
  it("refuses malformed data without writing", async () => {
    const f = fixture(); f.set("broken");
    await expect(f.controller.save("Notes", false)).rejects.toThrow("workspaces.json could not be read"); expect(f.get()).toBe("broken");
  });
  it("updates only its workspace and close leaves tabs alone", async () => {
    const f = fixture(); await f.controller.save("First", false);
    const file = JSON.parse(f.get()!); file.workspaces.push({ ...structuredClone(file.workspaces[0]), id: "other", name: "Other" }); f.set(JSON.stringify(file));
    f.controller.changed(); await f.controller.flush();
    expect(JSON.parse(f.get()!).workspaces[1].name).toBe("Other");
    await f.controller.close(); expect(f.tabs).toEqual(["unsaved"]);
  });
  it("renders paths as text and removes missing references", async () => {
    const f = fixture(); await f.controller.save("First", false);
    const file = JSON.parse(f.get()!); const path = "/<img src=x>.md"; file.workspaces[0].layout.panes[0].files = [{ path }]; file.workspaces[0].layout.panes[0].active = path; f.set(JSON.stringify(file));
    const strip = missingStrip(f.io, file.workspaces[0].id, [path], null); document.body.append(strip);
    expect(strip.querySelector("img")).toBeNull(); expect(strip.textContent).toContain(path);
    [...strip.querySelectorAll("button")].find(button => button.textContent === "Remove from workspace")!.click(); await tick();
    expect(JSON.parse(f.get()!).workspaces[0].layout.panes[0].files).toEqual([]); document.body.replaceChildren();
  });
});
