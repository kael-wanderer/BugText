import { beforeEach, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";
import { createAIPanel, type AIPanelDeps } from "../ai/panel";
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
let deps: AIPanelDeps;
let root: HTMLElement;
beforeEach(() => {
  installTestDom();
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(captureFolderState).mockReset().mockResolvedValue(new Map());
  const settings = structuredClone(DEFAULT_AI_SETTINGS);
  settings.uses.chat = {
    engine: { kind: "cli", tool: "claude" },
    model: "sonnet",
    effort: "",
  };
  deps = {
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
