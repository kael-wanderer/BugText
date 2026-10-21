import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { refreshAgentNotices, showAgentNotice } from "../mcp/notice";

describe("agent edit notice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installTestDom();
  });

  it("renders client and note names as literal text", () => {
    const host = document.createElement("div");
    showAgentNotice(host, { client: "<img>", name: "<b>note.md</b>", onUndo: vi.fn(), undoAvailable: () => true });
    expect(host.textContent).toContain("<img> updated <b>note.md</b> · saved");
    expect(host.querySelector("img")).toBeNull();
  });

  it("merges by client and note, keeping the first Undo action", () => {
    const host = document.createElement("div");
    const firstUndo = vi.fn();
    const secondUndo = vi.fn();
    showAgentNotice(host, { client: "Agent", name: "a.md", onUndo: firstUndo, undoAvailable: () => true });
    showAgentNotice(host, { client: "Agent", name: "a.md", onUndo: secondUndo, undoAvailable: () => true });
    expect(host.querySelectorAll(".agent-notice")).toHaveLength(1);
    host.querySelector<HTMLButtonElement>(".agent-notice-undo")!.click();
    expect(firstUndo).toHaveBeenCalledTimes(1);
    expect(secondUndo).not.toHaveBeenCalled();
  });

  it("hides Undo after owner changes and auto-hides after 6000 ms", () => {
    const host = document.createElement("div");
    let available = true;
    showAgentNotice(host, { client: "Agent owner", name: "a.md", onUndo: vi.fn(), undoAvailable: () => available });
    available = false;
    refreshAgentNotices();
    expect(host.querySelector<HTMLButtonElement>(".agent-notice-undo")!.hidden).toBe(true);
    vi.advanceTimersByTime(5999);
    expect(host.querySelector(".agent-notice")).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(host.querySelector(".agent-notice")).toBeNull();
    vi.useRealTimers();
  });
});
