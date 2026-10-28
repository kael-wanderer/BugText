// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: vi.fn() }));
import { showRecoveryReview } from "../recovery-review";

describe("recovery review", () => {
  beforeEach(() => { document.body.replaceChildren(); invoke.mockReset(); });
  it("renders untrusted names as text, counts selection, and dismisses without discarding", async () => {
    const name = '<img src=x onerror="pwned()">.md';
    invoke.mockImplementation(async (command: string) => {
      if (command === "recovery_list_drafts") return [{ id: "u123", path: null, name, contents: "hello there", updatedAt: 1, windowId: "main" }];
      if (command === "recovery_list_discarded") return [];
      throw new Error("unexpected command");
    });
    const host = document.createElement("div"); document.body.append(host);
    await showRecoveryReview({ host, findOpen: () => null, restore: vi.fn() });
    expect(host.textContent).toContain(name);
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("Restore selected (1)");
    host.querySelector<HTMLInputElement>('input[aria-label="Select all"]')!.click();
    await vi.waitFor(() => expect(host.textContent).toContain("Restore selected (0)"));
    host.querySelector<HTMLButtonElement>("button")!.click();
    expect(host.querySelector(".recovery-sheet")).toBeNull();
    expect(invoke.mock.calls.some(([command]) => command === "recovery_discard_draft")).toBe(false);
  });
});
