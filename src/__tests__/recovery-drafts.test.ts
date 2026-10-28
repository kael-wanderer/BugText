import { afterEach, describe, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: vi.fn() }));
import { scheduleDraft } from "../recovery";

describe("scheduleDraft", () => {
  afterEach(() => { vi.useRealTimers(); invoke.mockClear(); });

  it("clears the restored draft once the tab's own draft is written", async () => {
    vi.useFakeTimers();
    scheduleDraft({ windowId: "main", tabId: "t1", path: null, name: "Untitled", contents: "newer", replacedDraftId: "uold" });
    await vi.runAllTimersAsync();
    const commands = invoke.mock.calls.map(([command, args]) => [command, (args as { id?: string }).id ?? null]);
    expect(commands[0][0]).toBe("recovery_write_draft");
    expect(commands).toContainEqual(["recovery_clear_draft", "uold"]);
  });
});
