// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createConversationSwitcher, type ConversationStore } from "../ai/conversation-switcher";
import type { Conversation } from "../ai/conversations";
const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(f => f()); document.body.replaceChildren(); });
function setup() {
  let folder: string | null = "/notes";
  const values = new Map<string, Conversation>();
  function value(id: string, title: string, group: string | null = folder) { const v: Conversation = { version: 1, id, title, updatedAt: id === "a" ? 2 : 1, messages: [{ role: "user", text: "Question", time: 1 }] }; values.set(`${group}:${id}`, v); return v; }
  value("a", "First"); value("b", "<img src=x onerror=alert(1)>"); value("global", "Earlier chat", null);
  const trash = new Map<string, Conversation>();
  const store: ConversationStore = {
    list: vi.fn(async group => [...values.entries()].filter(([key]) => key.startsWith(`${group}:`)).map(([, v]) => v)),
    read: vi.fn(async (group, id) => { const v = values.get(`${group}:${id}`); if (!v) throw Error(); return structuredClone(v); }),
    write: vi.fn(async (group, v) => { values.set(`${group}:${v.id}`, structuredClone(v)); }),
    delete: vi.fn(async (group, id) => { const key = `${group}:${id}`; trash.set(key, values.get(key)!); values.delete(key); }),
    restore: vi.fn(async (group, id) => { const key = `${group}:${id}`; values.set(key, trash.get(key)!); }),
  };
  const host = document.createElement("div"); document.body.append(host);
  const load = vi.fn(); const readOnly = vi.fn(); const error = vi.fn();
  let receive: (change: any) => void = () => {};
  const emitted: any[] = [];
  const ui = createConversationSwitcher(host, { from: "self", folder: () => folder, store, load, readOnly, error, events: { emit: async change => { emitted.push(change); }, listen: async handler => { receive = handler; return () => {}; } } });
  disposers.push(ui.destroy);
  function click(text: string, scope: HTMLElement = host) { const button = [...scope.querySelectorAll("button")].find(b => b.textContent === text); expect(button).toBeTruthy(); button!.click(); }
  function open() { host.querySelector<HTMLButtonElement>(".ai-conversation-title")!.click(); }
  return { ui, host, load, readOnly, store, values, emitted, receive: (v: any) => receive({ from: "other", folder: "/notes", id: "a", ...v }), folder: (v: string | null) => { folder = v; }, click, open, error };
}
it("switches chats, renders HTML titles as text, and creates an unsaved new chat", async () => {
  const x = setup(); await x.ui.init(null); expect(x.load).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a" })); x.open(); expect(x.host.querySelector("img")).toBeNull(); expect(x.host.textContent).toContain("No folder"); x.click("<img src=x onerror=alert(1)>");
  await vi.waitFor(() => expect(x.load).toHaveBeenLastCalledWith(expect.objectContaining({ id: "b" })));
  await x.ui.newChat(); expect(x.load).toHaveBeenLastCalledWith(null); expect(x.store.write).not.toHaveBeenCalled();
});
it("renames inline and deletes with Undo", async () => {
  const x = setup(); await x.ui.init(null); x.open(); const row = x.host.querySelector<HTMLElement>(".ai-conversation-item")!; x.click("Rename", row); const input = row.querySelector("input")!; input.value = "<b>Renamed</b>"; x.click("Save", row);
  await vi.waitFor(() => expect(x.host.textContent).toContain("<b>Renamed</b>")); expect(x.host.querySelector("b")).toBeNull();
  x.click("Delete", x.host.querySelector<HTMLElement>(".ai-conversation-item")!);
  await vi.waitFor(() => expect(document.querySelector(".app-toast")?.textContent).toMatch(/^Deleted ".+" Undo$/)); expect(document.querySelector(".app-toast b")).toBeNull(); const undo = [...document.querySelectorAll("button")].find(b => b.textContent === "Undo")!; undo.click();
  await vi.waitFor(() => expect(x.store.restore).toHaveBeenCalledWith("/notes", "a")); expect(x.emitted.some(e => e.kind === "delete")).toBe(true);
});
it("saves to the captured folder and loads a different folder list", async () => {
  const x = setup(); await x.ui.init(null); const run = await x.ui.begin("Question"); expect(run).not.toBeNull(); x.folder(null);
  await x.ui.finish(run!, [{ role: "assistant", text: "Answer", time: 3 }]); expect(x.store.write).toHaveBeenCalledWith("/notes", expect.objectContaining({ id: "a" })); await x.ui.folderChanged(); expect(x.load).toHaveBeenLastCalledWith(expect.objectContaining({ id: "global" }));
});
it("locks remote streams then reloads when idle, and defers updates during a local stream", async () => {
  const x = setup(); await x.ui.init(null); x.receive({ kind: "stream" }); await vi.waitFor(() => expect(x.readOnly).toHaveBeenLastCalledWith(true)); expect(await x.ui.begin("Blocked")).toBeNull();
  x.values.get("/notes:a")!.title = "Remote title"; x.receive({ kind: "write" }); x.receive({ kind: "idle" }); await vi.waitFor(() => expect(x.load).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Remote title" }))); expect(x.ui.isReadOnly()).toBe(false);
  const run = await x.ui.begin("Local"); x.load.mockClear(); x.receive({ kind: "write" }); await Promise.resolve(); expect(x.load).not.toHaveBeenCalled(); await x.ui.finish(run!, [{ role: "assistant", text: "Done", time: 4 }]); expect(x.load).toHaveBeenCalled();
});

it("keeps this folder in the menu while a No folder conversation is open", async () => {
  const x = setup(); await x.ui.init(null); x.open(); x.click("Earlier chat");
  await vi.waitFor(() => expect(x.load).toHaveBeenLastCalledWith(expect.objectContaining({ id: "global" })));
  x.open(); expect(x.host.textContent).toContain("First"); expect(x.host.textContent).toContain("No folder");
});
