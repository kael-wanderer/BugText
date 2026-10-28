import { describe, it, expect, vi } from "vitest";
import {
  QUICK_ACTIONS,
  actionScope,
  enabledQuickActions,
  runQuickAction,
} from "../ai/quick-actions";
import { streamChat } from "../ai/client";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";

vi.mock("../ai/client", () => ({
  streamChat: vi.fn(async (_row, _settings, _messages, onChunk) => {
    onChunk("REVISED");
  }),
}));

describe("quick-action catalog", () => {
  it("defines the four v1 actions with correct kinds", () => {
    const byId = Object.fromEntries(QUICK_ACTIONS.map((a) => [a.id, a]));
    expect(byId["ai.quick.proofread"].kind).toBe("edit");
    expect(byId["ai.quick.rewrite"].kind).toBe("edit");
    expect(byId["ai.quick.summarize"].kind).toBe("chat");
    expect(byId["ai.quick.outline"].kind).toBe("chat");
    for (const action of QUICK_ACTIONS) {
      expect(action.prompt.trim().length).toBeGreaterThan(0);
      expect(action.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("actionScope", () => {
  it("uses the selection when present", () => {
    expect(actionScope("picked", "whole doc")).toEqual({
      text: "picked",
      whole: false,
    });
  });
  it("falls back to the whole document when selection is empty", () => {
    expect(actionScope("   ", "whole doc")).toEqual({
      text: "whole doc",
      whole: true,
    });
  });
});

describe("per-feature engines", () => {
  it("excludes disabled rewrite", () => {
    const settings = structuredClone(DEFAULT_AI_SETTINGS);
    settings.enabled.rewrite = false;
    expect(enabledQuickActions(settings).map(a => a.feature)).not.toContain("rewrite");
  });
  it("uses the proofread row and forces answer-only without a folder", async () => {
    const settings = structuredClone(DEFAULT_AI_SETTINGS);
    const row = { engine: {kind: "cli" as const, tool: "claude" as const}, model: "sonnet", effort: "low" };
    settings.uses.proofread = row;
    await runQuickAction(QUICK_ACTIONS[0], {...baseDeps(), getSettings: () => settings});
    expect(streamChat).toHaveBeenLastCalledWith(row, settings, expect.any(Array), expect.any(Function), expect.objectContaining({write: false, folder: null}));
  });
  it("reports an unconfigured engine without sending", async () => {
    vi.mocked(streamChat).mockClear();
    const append = vi.fn(() => bubble());
    await runQuickAction(QUICK_ACTIONS[0], {...baseDeps(), getSettings: () => ({...DEFAULT_AI_SETTINGS, uses: {proofread: {engine: {kind: "none"}, model: "", effort: ""}}}), appendBubble: append});
    expect(append).toHaveBeenCalledWith("system", "Choose an engine for Proofread in Settings ▸ AI ▸ Use for.");
    expect(streamChat).not.toHaveBeenCalled();
  });
});

function bubble() {
  return { textContent: "" as string | null };
}

function baseDeps(overrides = {}) {
  return {
    getSettings: () => DEFAULT_AI_SETTINGS,
    getClis: () => [{tool: "claude" as const, found: true, path: "/claude", version: "1", accounts: [], models: []}],
    getDoc: () => ({
      text: "hello world",
      selection: "hello",
      windowId: "w1",
      tabId: "t1",
      from: 0,
      to: 5,
    }),
    reviewEdit: vi.fn(),
    appendBubble: vi.fn(() => bubble()),
    getWorkingDir: () => null,
    makeAbort: () => new AbortController(),
    ...overrides,
  };
}

describe("runQuickAction", () => {
  it("no-ops with a notice when selection and document are both empty", async () => {
    const append = vi.fn(() => bubble());
    await runQuickAction(QUICK_ACTIONS[0], {
      ...baseDeps(),
      getDoc: () => ({
        text: "",
        selection: "",
        windowId: "w1",
        tabId: "t1",
        from: 0,
        to: 0,
      }),
      appendBubble: append,
    });
    expect(append).toHaveBeenCalledWith(
      "system",
      expect.stringContaining("Nothing to"),
    );
  });

  it("renders a chat-kind reply into a bubble", async () => {
    const el = bubble();
    const append = vi.fn(() => el);
    const review = vi.fn();
    await runQuickAction(
      QUICK_ACTIONS.find((a) => a.id === "ai.quick.summarize")!,
      { ...baseDeps(), appendBubble: append, reviewEdit: review },
    );
    expect(append).toHaveBeenCalledWith("assistant", "");
    expect(el.textContent).toBe("REVISED");
    expect(review).not.toHaveBeenCalled();
  });

  it("warns when the action context is trimmed", async () => {
    const append = vi.fn(() => bubble());
    await runQuickAction(
      QUICK_ACTIONS.find((a) => a.id === "ai.quick.summarize")!,
      {
        ...baseDeps(),
        getSettings: () => ({
          ...DEFAULT_AI_SETTINGS,
          maxContextChars: 25,
        }),
        appendBubble: append,
      },
    );
    expect(append).toHaveBeenCalledWith(
      "system",
      expect.stringContaining("dropped"),
    );
  });

  it("opens a diff review for an edit-kind action bound to the source", async () => {
    const review = vi.fn();
    await runQuickAction(
      QUICK_ACTIONS.find((a) => a.id === "ai.quick.proofread")!,
      { ...baseDeps(), reviewEdit: review },
    );
    expect(review).toHaveBeenCalledTimes(1);
    const [base, reply, binding] = review.mock.calls[0];
    expect(base).toBe("hello");
    expect(reply).toBe("REVISED");
    expect(binding).toMatchObject({ windowId: "w1", tabId: "t1", from: 0, to: 5 });
  });

  it("binds an edit to the whole document when nothing is selected", async () => {
    const review = vi.fn();
    await runQuickAction(
      QUICK_ACTIONS.find((a) => a.id === "ai.quick.rewrite")!,
      {
        ...baseDeps(),
        getDoc: () => ({
          text: "hello world",
          selection: "",
          windowId: "w1",
          tabId: "t1",
          from: 3,
          to: 3,
        }),
        reviewEdit: review,
      },
    );
    const [base, , binding] = review.mock.calls[0];
    expect(base).toBe("hello world");
    expect(binding).toMatchObject({ from: 0, to: "hello world".length, selection: "" });
  });
});

describe("saved action runner", () => {
  const action = { id: "custom", name: "Extract", instruction: "Extract tasks", result: "answer" as const, input: "selection-or-note" as const, engine: null, panel: true };
  it("sends only selected input and labels the answer", async () => {
    const append = vi.fn(() => bubble());
    await runQuickAction(action, { ...baseDeps(), appendBubble: append });
    expect(append).toHaveBeenCalledWith("user", "▸ Extract · on selection (1 line)");
    expect(streamChat).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.any(Array), expect.any(Function), expect.objectContaining({ folder: null, write: false }));
  });
  it("reviews a whole-note edit", async () => {
    const review = vi.fn();
    await runQuickAction({ ...action, result: "edit", input: "note" }, { ...baseDeps(), reviewEdit: review });
    expect(review).toHaveBeenCalledWith("hello world", "REVISED", expect.objectContaining({ from: 0, to: 11 }));
  });
});

it("refuses built-in and saved action inputs from excluded notes", async () => {
  vi.mocked(streamChat).mockClear();
  const settings = structuredClone(DEFAULT_AI_SETTINGS); settings.context.exclude = ["private/**"];
  for (const action of [QUICK_ACTIONS[0], { id: "custom", name: "Extract", instruction: "Extract", input: "note" as const, result: "answer" as const, engine: null, panel: true }]) {
    const append = vi.fn(() => bubble()); const deps = baseDeps();
    await runQuickAction(action, { ...deps, getSettings: () => settings, getWorkingDir: () => "/notes", getDoc: () => ({ ...deps.getDoc(), path: "/notes/private/a.md" }), appendBubble: append });
    expect(append).toHaveBeenCalledWith("system", "private/a.md is excluded from AI context in Settings.");
  }
  expect(streamChat).not.toHaveBeenCalled();
});
