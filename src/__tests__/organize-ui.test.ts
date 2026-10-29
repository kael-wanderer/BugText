// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrganizeActions, type OrganizeHost } from "../notes/actions";
import { createLinkIndex } from "../links/index";
const calls = vi.hoisted(() => ({ create: vi.fn(), snapshot: vi.fn(), toast: vi.fn() }));
vi.mock("../templates/library", () => ({ createFromTemplate: calls.create, listTemplates: async () => [], readTemplate: vi.fn() }));
vi.mock("../recovery", () => ({ manualSnapshot: calls.snapshot }));
vi.mock("../toast", () => ({ showToast: calls.toast }));
vi.mock("../saved-views/store", () => ({ createWorkflowStore: () => ({ reload: async () => {}, items: [], error: null, dispose: vi.fn(), update: vi.fn() }) }));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(text = "A complete paragraph.\n") {
 const host = document.createElement("div"); document.body.append(host);
 const source = { tabId: "a", revision: 1, path: "/notes/source.md", text, from: 0, to: text.length };
 const deps: OrganizeHost = { host: () => host, getFolder: () => "/notes", getSource: () => source, apply: vi.fn(() => true), index: createLinkIndex(async () => ({ notes: [], skipped: [] })), openPath: vi.fn(async () => {}), openForEdit: vi.fn(async () => source), refreshExplorer: vi.fn(async () => {}), afterDiskWrite: vi.fn(), getTemplates: () => ({ folder: "", dateFormat: "YYYY-MM-DD", defaultFolder: "", lastUsed: "" }) as ReturnType<OrganizeHost["getTemplates"]> };
 return { host, source, deps, actions: createOrganizeActions(deps) };
}
const button = (host: HTMLElement, label: string) => [...host.querySelectorAll("button")].find(b => b.textContent === label)!;
beforeEach(() => { document.body.replaceChildren(); vi.clearAllMocks(); calls.create.mockResolvedValue("/notes/New.md"); calls.snapshot.mockResolvedValue(undefined); });
describe("organize workflow UI", () => {
 it("does not apply source edits when create-new fails", async () => {
  calls.create.mockRejectedValue(new Error("Disk full")); const { host, deps, actions } = setup(); actions.extractSelection(); button(host, "Extract").click(); await flush();
  expect(deps.apply).not.toHaveBeenCalled(); expect(host.textContent).toContain("Disk full");
 });
 it("keeps created note when source binding became stale", async () => {
  const { host, deps, actions } = setup(); vi.mocked(deps.apply).mockReturnValue(false); actions.extractSelection(); button(host, "Extract").click(); await flush();
  expect(calls.create).toHaveBeenCalledOnce(); expect(calls.toast.mock.calls[0][0]).toContain("source changed");
 });
 it("renders source HTML as text and returns focus on Escape", () => {
  const opener = document.createElement("button"); document.body.append(opener); opener.focus(); const { host, actions } = setup("<img src=x onerror=alert(1)>\n"); actions.extractSelection();
  expect(host.querySelector("img")).toBeNull(); host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(opener);
 });
 it("shows a reviewed missing-fields apply and sends one source transaction", async () => {
  const { host, deps, actions } = setup("---\nstatus: active # keep\n---\n# Project\n"); await actions.applyNoteType(); await flush();
  button(host, "Apply missing fields").click(); await flush();
  expect(deps.apply).toHaveBeenCalledOnce(); const change = vi.mocked(deps.apply).mock.calls[0][1]; expect(change.insert).toContain("status: active # keep"); expect(change.insert).toContain("# Project\n");
 });
});
