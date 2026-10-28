import type { ContextChipsState } from "./context-chips";
import { emit, listen } from "@tauri-apps/api/event";
import { showToast } from "../toast";
import { capConversation, conversationTitle, deleteConversation, listConversations, readConversation, restoreConversation, writeConversation, type Conversation, type ConversationEntry } from "./conversations";
export const CONVERSATION_EVENT = "bugtext://conversation-changed";
type Change = { from: string; folder: string | null; id: string; kind: "write" | "delete" | "stream" | "idle" | "probe" };
export type ConversationStore = {
  list: typeof listConversations; read: typeof readConversation; write: typeof writeConversation;
  delete: typeof deleteConversation; restore: typeof restoreConversation;
};
const defaultStore: ConversationStore = { list: listConversations, read: readConversation, write: writeConversation, delete: deleteConversation, restore: restoreConversation };
export function relativeConversationTime(time: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  return minutes < 1 ? "now" : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ago` : minutes < 2880 ? "yesterday" : new Date(time).toLocaleDateString();
}
export function createConversationSwitcher(host: HTMLElement, deps: {
  from: string; folder(): string | null; busy?(): boolean;
  load(value: Conversation | null): void;
  readOnly(value: boolean): void;
  error(text: string): void;
  store?: ConversationStore;
  events?: { emit(change: Change): Promise<void>; listen(handler: (change: Change) => void): Promise<() => void> };
}) {
  const store = deps.store ?? defaultStore;
  let writes: Promise<void> = Promise.resolve();
  function persistConversation(folder: string | null, value: Conversation): Promise<void> {
    const snapshot = structuredClone(value);
    const next = writes.catch(() => {}).then(() => store.write(folder, snapshot));
    writes = next; return next;
  }
  const events = deps.events ?? {
    emit: (change: Change) => emit(CONVERSATION_EVENT, change),
    listen: (handler: (change: Change) => void) => listen<Change>(CONVERSATION_EVENT, event => handler(event.payload)),
  };
  let workspaceFolder = deps.folder();
  let folder = workspaceFolder;
  let active: Conversation | null = null;
  let entries: ConversationEntry[] = [];
  let globals: ConversationEntry[] = [];
  let generation = 0;
  let streaming = false;
  let pendingReload = false;
  let open = false;
  const locks = new Map<string, number>();
  const root = document.createElement("div"); root.className = "ai-conversation-switcher"; host.prepend(root);
  root.addEventListener("keydown", event => { if (event.key === "Escape" && open) { event.stopPropagation(); open = false; draw(); root.querySelector<HTMLButtonElement>(".ai-conversation-title")?.focus(); } });
  function notify(kind: Change["kind"], id = active?.id ?? "", group = folder): Promise<void> {
    return events.emit({ from: deps.from, folder: group, id, kind }).catch(() => {});
  }
  function locked(id = active?.id, group = folder): boolean { return !!id && [...locks.entries()].some(([key, until]) => key.startsWith(`${JSON.stringify(group)}:`) && key.endsWith(`:${id}`) && until > Date.now()); }
  function draw(): void {
    root.replaceChildren();
    const title = btn(`${active?.title ?? "New chat"} ▾`, () => { open = !open; draw(); }); title.className = "ai-conversation-title"; title.setAttribute("aria-expanded", String(open));
    root.append(title, btn("＋", () => { void newChat(); })); root.lastElementChild!.setAttribute("aria-label", "New chat ⌥⌘J");
    deps.readOnly(locked());
    root.querySelectorAll("button").forEach(button => { button.disabled = streaming || !!deps.busy?.(); });
    if (!open) return;
    const menu = document.createElement("div"); menu.className = "ai-conversation-menu";
    menu.append(btn("＋ New chat", () => { void newChat(); }));
    function group(label: string, items: ConversationEntry[], groupFolder: string | null): void {
      const heading = document.createElement("div"); heading.className = "ai-conversation-group"; heading.textContent = label; menu.append(heading);
      for (const item of [...items].sort((a, b) => b.updatedAt - a.updatedAt)) {
        const row = document.createElement("div"); row.className = "ai-conversation-item";
        const pick = btn(item.title, () => { void select(groupFolder, item.id); }); pick.setAttribute("aria-current", String(active?.id === item.id && folder === groupFolder));
        const time = document.createElement("small"); time.textContent = relativeConversationTime(item.updatedAt);
        row.append(pick, time, btn("Rename", () => {
          if (streaming || deps.busy?.() || locked(item.id, groupFolder)) return;
          const input = document.createElement("input"); input.value = item.title; input.setAttribute("aria-label", "Conversation title");
          const save = async () => { const title = input.value.trim(); if (!title) return; try { const value = await store.read(groupFolder, item.id); value.title = title; await persistConversation(groupFolder, value); await notify("write", item.id, groupFolder); if (folder === groupFolder && active?.id === item.id) active = value; await refresh(); } catch { deps.error("Could not rename conversation."); } };
          row.replaceChildren(input, btn("Save", () => { void save(); }), btn("Cancel", draw)); input.addEventListener("keydown", e => { if (e.key === "Enter") void save(); if (e.key === "Escape") draw(); }); input.focus();
        }), btn("Delete", () => { void remove(groupFolder, item.id); })); menu.append(row);
      }
    }
    group(workspaceFolder ? `${workspaceFolder.split(/[\\/]/).pop()} · this folder` : "No folder", entries, workspaceFolder);
    if (workspaceFolder) group("No folder", globals, null);
    root.append(menu);
    root.querySelectorAll("button").forEach(button => { button.disabled = streaming || !!deps.busy?.(); });
  }
  function btn(text: string, click: () => void): HTMLButtonElement { const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.addEventListener("click", click); return button; }
  async function refresh(): Promise<void> {
    const version = generation; const group = workspaceFolder;
    try { const [list, global] = await Promise.all([store.list(group), group ? store.list(null) : Promise.resolve([])]); if (version !== generation) return; entries = list; globals = global; draw(); }
    catch { deps.error("Could not load conversations."); }
  }
  async function select(group: string | null, id: string): Promise<void> {
    if (streaming || deps.busy?.()) return;
    const version = ++generation;
    try { const value = await store.read(group, id); if (version !== generation) return; folder = group; active = value; open = false; deps.load(value); await refresh(); await notify("probe"); }
    catch { deps.error("Could not load conversation."); }
  }
  async function newChat(): Promise<void> {
    if (streaming || deps.busy?.()) return;
    generation++; folder = deps.folder(); active = null; open = false; deps.load(null); await refresh();
  }
  async function remove(group: string | null, id: string): Promise<void> {
    if (streaming || deps.busy?.() || locked(id, group)) return;
    try {
      await store.delete(group, id); await notify("delete", id, group);
      if (folder === group && active?.id === id) { active = null; deps.load(null); }
      await refresh();
      showToast("Deleted ·", 7000, { label: "Undo", run: () => { void store.restore(group, id).then(async () => { await notify("write", id, group); await refresh(); }).catch(() => deps.error("Could not restore conversation.")); } });
    } catch { deps.error("Could not delete conversation."); }
  }
  async function reload(): Promise<void> {
    if (!active) return;
    const version = generation; const id = active.id;
    try { const value = await store.read(folder, id); if (version !== generation || active?.id !== id) return; active = value; deps.load(value); draw(); }
    catch { if (version === generation) deps.error("Could not reload conversation."); }
  }
  async function changed(change: Change): Promise<void> {
    if (!change || typeof change.from !== "string" || typeof change.id !== "string" || (change.folder !== null && typeof change.folder !== "string") || change.from === deps.from || !["write", "delete", "stream", "idle", "probe"].includes(change.kind)) return;
    if (change.kind === "probe") { if (streaming) await notify("stream"); return; }
    if (change.folder !== workspaceFolder && change.folder !== null && change.folder !== folder) return;
    const key = `${JSON.stringify(change.folder)}:${change.from}:${change.id}`;
    if (change.kind === "stream") { const known = locks.has(key); locks.set(key, Date.now() + 15000); if (known) return; }
    if (change.kind === "idle" || change.kind === "delete") locks.delete(key);
    if (folder === change.folder && active?.id === change.id && change.kind === "delete") { active = null; deps.load(null); }
    if (folder === change.folder && active?.id === change.id && change.kind !== "stream") {
      if (streaming || locked()) pendingReload = true;
      else { pendingReload = false; await reload(); }
    }
    await refresh();
  }
  let unlisten: (() => void) | undefined;
  let destroyed = false;
  const listening = events.listen(change => { void changed(change); }).then(stop => { if (destroyed) stop(); else unlisten = stop; }).catch(() => deps.error("Could not synchronize conversations."));
  const timer = window.setInterval(() => { if (streaming) void notify("stream"); else { let expired = false; for (const [key, until] of locks) if (until <= Date.now()) { locks.delete(key); expired = true; } if (pendingReload && !locked()) { pendingReload = false; void reload(); } if (expired) draw(); } }, 5000);
  return {
    async init(migrated: Conversation | null) { await listening; if (migrated) await notify("write", migrated.id, null); if (migrated && !folder) { active = migrated; deps.load(active); } await refresh(); if (!active && entries[0]) await select(workspaceFolder, entries[0].id); else deps.load(active); draw(); await notify("probe"); },
    newChat,
    refreshState: draw,
    async folderChanged() { if (deps.folder() === workspaceFolder) return; workspaceFolder = deps.folder(); const version = ++generation; folder = workspaceFolder; active = null; locks.clear(); deps.load(null); await refresh(); if (version !== generation) return; if (entries[0]) await select(workspaceFolder, entries[0].id); },
    async begin(prompt: string, contextChips?: ContextChipsState) {
      if (streaming || locked()) return null;
      active ??= { version: 1, id: crypto.randomUUID(), title: conversationTitle(prompt), updatedAt: Date.now(), messages: [] };
      if (contextChips) active.contextChips = contextChips;
      streaming = true; draw(); await notify("stream");
      return { folder, value: structuredClone(active) };
    },
    async finish(run: { folder: string | null; value: Conversation }, messages: Conversation["messages"]) {
      const value = capConversation({ ...run.value, updatedAt: Date.now(), messages: [...run.value.messages, ...messages] });
      try { await persistConversation(run.folder, value); await notify("write", value.id, run.folder); if (folder === run.folder && active?.id === value.id) active = value; }
      finally { streaming = false; await notify("idle", value.id, run.folder); await refresh(); if (pendingReload) { pendingReload = false; await reload(); } draw(); }
      return value;
    },
    async cancel() { streaming = false; await notify("idle"); if (pendingReload) { pendingReload = false; await reload(); } draw(); },
    async updateContext(contextChips: ContextChipsState) {
      if (streaming || locked() || !active) return;
      active = { ...active, contextChips };
      if (active.messages.length) { await persistConversation(folder, active); await notify("write"); }
    },
    getActive: () => active,
    isReadOnly: locked,
    destroy() { destroyed = true; window.clearInterval(timer); unlisten?.(); },
  };
}
