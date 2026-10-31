// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";
import { createAIPanel as buildPanel, type AIPanelDeps, type AIPanel } from "../ai/panel";
import { listConversations, readConversation, writeConversation } from "../ai/conversations";
import { streamChat } from "../ai/client";
import { captureFolderState } from "../ai/run-summary";
vi.mock("../ai/client", () => ({
  streamChat: vi.fn(async (_row, _settings, _messages, onChunk) =>
    onChunk("reply"),
  ),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../ai/workspace-index", () => ({
  createWorkspaceIndex: () => ({
    query: vi.fn().mockResolvedValue([]),
    queryScored: vi.fn().mockResolvedValue([]),
    reset: vi.fn(),
    onFileChanged: vi.fn(),
    onFileRemoved: vi.fn(),
  }),
}));
vi.mock("../ai/edit-review", () => ({ showDiff: vi.fn() }));
vi.mock("../ai/run-summary", async () => ({
  ...(await vi.importActual("../ai/run-summary")),
  captureFolderState: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("../ai/conversations", async () => ({
  ...(await vi.importActual("../ai/conversations")),
  listConversations: vi.fn(async () => []),
  readConversation: vi.fn(),
  writeConversation: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(async () => {}), listen: vi.fn(async () => () => {}) }));
const panels: AIPanel[] = [];
function createAIPanel(...args: Parameters<typeof buildPanel>) { const panel = buildPanel(...args); panels.push(panel); return panel; }
afterEach(() => { panels.splice(0).forEach(panel => panel.destroy()); });
let deps: AIPanelDeps;
let root: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(readConversation).mockReset();
  vi.mocked(captureFolderState).mockReset().mockResolvedValue(new Map());
  const settings = structuredClone(DEFAULT_AI_SETTINGS);
  settings.uses.chat = {
    engine: { kind: "cli", tool: "claude" },
    model: "sonnet",
    effort: "",
  };
  deps = {
    workspaceIndex: {
      chunkCount: 0,
      query: vi.fn().mockResolvedValue([]),
      queryScored: vi.fn().mockResolvedValue([]),
      reset: vi.fn(),
      onFileChanged: vi.fn(),
      onFileRemoved: vi.fn(),
    },
    getSettings: () => settings,
    onSettingsChange: vi.fn((next) => Object.assign(settings, next)),
    getClis: () => [
      {
        tool: "claude",
        found: true,
        path: "claude",
        version: "1",
        accounts: [],
        models: [],
      },
    ],
    getModelsCache: () => ({}),
    guard: { tabsInFolder: () => [], snapshot: vi.fn(), checkTab: vi.fn() },
    onNewNote: vi.fn(),
    onOpenNote: vi.fn(),
    getDoc: () => ({
      text: "doc",
      selection: "",
      windowId: "main",
      tabId: "t1",
      from: 0,
      to: 0,
      path: null,
    }),
    lookupTabText: () => "doc",
    applyEditTo: vi.fn(),
    onInsert: vi.fn(),
    onOpenChangedFile: vi.fn(),
    onClose: vi.fn(),
    getSendAccelerator: () => "Mod+Enter",
    getWorkingDir: () => "/notes",
    getFileList: () => [],
    getWorkspaceContext: () => ({ k: 5 }),
    historyKey: "test-chat",
  };
  root = document.createElement("aside");
  const body = document.createElement("div");
  body.className = "ai-body";
  const close = document.createElement("button");
  close.className = "ai-close";
  const header = document.createElement("div");
  header.className = "ai-header";
  const title = document.createElement("strong");
  title.textContent = "Chat";
  header.append(title, close);
  root.append(header, body);
});
function send() {
  const input = root.querySelector(".ai-input") as HTMLTextAreaElement;
  input.value = "hello";
  root.querySelector<HTMLButtonElement>(".ai-send")!.click();
}
it("shows Chat only and grouped engines", () => {
  createAIPanel(root, deps);
  expect(
    root.querySelector(".ai-header")!.querySelector(".ai-chat-picker"),
  ).not.toBeNull();
  expect(root.textContent).not.toContain("Runs");
  expect(root.textContent).not.toContain("Agent Console");
  expect(
    Array.from(root.querySelectorAll("optgroup")).map((g) =>
      g.getAttribute("label"),
    ),
  ).toEqual(["Connections", "Coding agents"]);
});
it("runs CLI with the folder and saves reply as a note", async () => {
  createAIPanel(root, deps);
  send();
  await vi.waitFor(() => expect(streamChat).toHaveBeenCalled());
  expect(streamChat).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.any(Function),
    expect.objectContaining({ write: true, folder: "/notes" }),
  );
  await vi.waitFor(() =>
    expect(root.textContent).toContain("Save as new note"),
  );
  Array.from(root.querySelectorAll("button"))
    .find((b) => b.textContent === "Save as new note")!
    .click();
  expect(deps.onNewNote).toHaveBeenCalledWith("reply");
});
it("runs without write permission when no folder is open", async () => {
  deps.getWorkingDir = () => null;
  createAIPanel(root, deps);
  send();
  await vi.waitFor(() => expect(streamChat).toHaveBeenCalled());
  expect(streamChat).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.any(Function),
    expect.objectContaining({ write: false, folder: null }),
  );
  await vi.waitFor(() =>
    expect(root.textContent).toContain(
      "Open a folder to let agents write files.",
    ),
  );
});
it("renders changed file names as text", async () => {
  vi.mocked(captureFolderState)
    .mockResolvedValueOnce(new Map())
    .mockResolvedValueOnce(
      new Map([
        ["<img onerror>.md", { mtimeMs: 1, size: 1 }],
        ["b.md", { mtimeMs: 1, size: 1 }],
      ]),
    );
  createAIPanel(root, deps);
  send();
  await vi.waitFor(() => expect(root.textContent).toContain("Changed 2 files"));
  expect(root.textContent).toContain("<img onerror>.md");
  expect(root.querySelector("img")).toBeNull();
});
it("preserves the input when settings render again", () => {
  const panel = createAIPanel(root, deps);
  const input = root.querySelector(".ai-input") as HTMLTextAreaElement;
  input.value = "draft";
  panel.render();
  expect(root.querySelector(".ai-input")).toBe(input);
  expect(input.value).toBe("draft");
});

it("keeps Pi answer-only even with an open folder", async () => {
  deps.getSettings().uses.chat = {
    engine: { kind: "cli", tool: "pi" },
    model: "",
    effort: "",
  };
  createAIPanel(root, deps);
  send();
  await vi.waitFor(() => expect(streamChat).toHaveBeenCalled());
  expect(streamChat).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.any(Function),
    expect.objectContaining({ write: false, folder: null }),
  );
  expect(captureFolderState).not.toHaveBeenCalled();
});
it("checks changed open files after a cancelled run", async () => {
  const check = vi.fn();
  deps.guard = {
    tabsInFolder: () => [{ path: "/notes/a.md", text: "dirty", dirty: true }],
    snapshot: vi.fn(),
    checkTab: check,
  };
  vi.mocked(captureFolderState)
    .mockResolvedValueOnce(new Map())
    .mockResolvedValueOnce(new Map([["a.md", { mtimeMs: 1, size: 1 }]]));
  vi.mocked(streamChat).mockRejectedValueOnce(
    new DOMException("cancelled", "AbortError"),
  );
  createAIPanel(root, deps);
  send();
  await vi.waitFor(() => expect(check).toHaveBeenCalledWith("/notes/a.md"));
  expect(root.textContent).toContain("Changed 1 file");
  expect(root.textContent).toContain("Reply cancelled.");
});

it("inlines outside-folder CLI attachments instead of passing their paths", async () => {
  const panel = createAIPanel(root, deps);
  const { invoke } = await import("@tauri-apps/api/core");
  vi.mocked(invoke).mockResolvedValue("private attachment text");
  panel.addAttachments(["/outside/private.md"]);
  send();
  await vi.waitFor(() => expect(streamChat).toHaveBeenCalled());
  const [, , messages, , options] = vi.mocked(streamChat).mock.calls[vi.mocked(streamChat).mock.calls.length - 1];
  expect(JSON.stringify(messages)).toContain("private attachment text");
  expect(options.attachmentPaths).toEqual([]);
});

it("loads the active saved chat and saves replies in its folder", async () => {
  const value = { version: 1 as const, id: "saved", title: "Saved chat", updatedAt: 1, messages: [{ role: "user" as const, text: "Previous question", time: 1 }] };
  vi.mocked(listConversations).mockImplementation(async folder => folder === "/notes" ? [value] : []);
  vi.mocked(readConversation).mockResolvedValue(value);
  const panel = createAIPanel(root, deps);
  await vi.waitFor(() => expect(root.textContent).toContain("Previous question"));
  send();
  await vi.waitFor(() => expect(writeConversation).toHaveBeenCalledWith("/notes", expect.objectContaining({ id: "saved", messages: expect.arrayContaining([expect.objectContaining({ text: "reply" })]) })));
  expect(localStorage.getItem("test-chat")).toBeNull();
  await vi.waitFor(() => expect(root.textContent).toContain("Save as new note"));
  panel.newChat();
  await vi.waitFor(() => expect(root.querySelector(".ai-messages")!.textContent).toBe(""));
});

it("persists an Answer action in the active named conversation", async () => {
  const panel = createAIPanel(root, deps);
  await panel.runAction({ id: "custom", name: "Extract", instruction: "Extract tasks", input: "note", result: "answer", engine: null, panel: true }, {
    getSettings: deps.getSettings, getClis: deps.getClis, getDoc: deps.getDoc,
    reviewEdit: vi.fn(), appendBubble: panel.appendBubble, getWorkingDir: deps.getWorkingDir,
    makeAbort: () => new AbortController(),
  });
  expect(writeConversation).toHaveBeenCalledWith("/notes", expect.objectContaining({ messages: expect.arrayContaining([
    expect.objectContaining({ role: "user", text: "▸ Extract · on note" }),
    expect.objectContaining({ role: "assistant", text: "reply", engine: expect.any(String) }),
  ]) }));
  expect(root.querySelector(".ai-reply-meta")?.textContent).toMatch(/ · \d+\.\ds$/);
});

it("refuses excluded attachments and hides them from @ before reading", async () => {
  deps.getSettings().context.exclude = ["private/**"];
  deps.getFileList = () => [{ path: "/notes/private/salary.md", name: "private/salary.md" }, { path: "/notes/public.md", name: "public.md" }];
  const panel = createAIPanel(root, deps);
  await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>(".ai-context-chips button")!.disabled).toBe(false));
  panel.addAttachments(["/notes/private/salary.md"]);
  expect(document.body.textContent).toContain("private/salary.md is excluded from AI context in Settings.");
  expect(root.querySelector(".ai-context-chips")!.textContent).not.toContain("salary");
  const input = root.querySelector<HTMLTextAreaElement>(".ai-input")!; input.value = "@"; input.selectionStart = 1; input.dispatchEvent(new Event("input"));
  expect(root.querySelector(".ai-mention")!.textContent).not.toContain("salary");
  send(); await vi.waitFor(() => expect(streamChat).toHaveBeenCalled());
  const { invoke } = await import("@tauri-apps/api/core"); expect(invoke).not.toHaveBeenCalledWith("read_file", { path: "/notes/private/salary.md" });
});
it("sends prompt only with both chips off and persists chips and Context sent", async () => {
  const panel = createAIPanel(root, deps); panel.render();
  await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>(".ai-context-chips button")!.disabled).toBe(false));
  const chips = root.querySelector(".ai-context-chips")!;
  [...chips.querySelectorAll("button")].find(b => b.textContent?.includes("This note"))!.click();
  [...chips.querySelectorAll("button")].find(b => b.textContent?.includes("Folder search"))!.click();
  send(); await vi.waitFor(() => expect(streamChat).toHaveBeenCalled());
  const messages = vi.mocked(streamChat).mock.calls[0][2]; expect(JSON.stringify(messages.filter(m => m.role === "user"))).not.toContain("<document>"); expect(deps.workspaceIndex.query).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(writeConversation).toHaveBeenCalledWith("/notes", expect.objectContaining({ contextChips: { note: false, search: false, files: [] }, messages: expect.arrayContaining([expect.objectContaining({ role: "assistant", context: expect.objectContaining({ excerpts: [], files: [] }) })]) })));
  expect(root.textContent).toContain("Context sent");
  await vi.waitFor(() => expect(root.querySelector(".ai-reply-meta")).not.toBeNull()); expect(root.querySelector(".ai-reply-meta")!.textContent).not.toContain("Searched");
});
it("locks the excluded open note and omits its document block", async () => {
  deps.getSettings().context.exclude = ["private/**"];
  const doc = deps.getDoc(); deps.getDoc = () => ({ ...doc, path: "/notes/private/a.md" });
  createAIPanel(root, deps);
  expect(root.querySelector<HTMLButtonElement>(".ai-context-chips button")!.disabled).toBe(true);
  send(); await vi.waitFor(() => expect(streamChat).toHaveBeenCalled());
  expect(JSON.stringify(vi.mocked(streamChat).mock.calls[0][2].filter(m => m.role === "user"))).not.toContain("<document>");
});

it("restores optional conversation chips and saved Context sent", async () => {
  const saved = { version: 1 as const, id: "saved", title: "Saved", updatedAt: 1,
    contextChips: { note: false, search: false, files: [] },
    messages: [{ role: "assistant" as const, text: "Old reply", time: 1, context: { note: { path: "old.md", label: "This note", chars: 42 }, excerpts: [], files: [], trimmed: 0 } }],
  };
  vi.mocked(listConversations).mockImplementation(async folder => folder === "/notes" ? [saved] : []); vi.mocked(readConversation).mockResolvedValue(saved);
  createAIPanel(root, deps);
  await vi.waitFor(() => expect(root.textContent).toContain("old.md (42 chars)"));
  const note = [...root.querySelectorAll<HTMLButtonElement>(".ai-context-chips button")].find(b => b.textContent?.includes("This note"))!;
  expect(note.getAttribute("aria-pressed")).toBe("false"); note.click();
  await vi.waitFor(() => expect(writeConversation).toHaveBeenCalledWith("/notes", expect.objectContaining({ contextChips: { note: true, search: false, files: [] } })));
});
