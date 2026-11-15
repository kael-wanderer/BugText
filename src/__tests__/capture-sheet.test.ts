// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { showCaptureSheet, type SheetInput } from "../capture/sheet";

const input = (over: Partial<SheetInput> = {}): SheetInput => ({
  kind: "excerpt",
  quote: "The sync model assumes a single writer.",
  label: "Architecture › Sync model",
  target: { kind: "companion" },
  targetHint: (t) => (t.kind === "companion" ? "arch.notes.md, beside the document" : t.kind === "daily" ? "Daily/2026-11-14.md" : t.relative),
  chooseNote: async () => null,
  ...over,
});
const sheet = () => document.querySelector<HTMLFormElement>(".capture-sheet")!;
const save = () => sheet().requestSubmit();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => document.querySelectorAll(".capture-sheet-overlay").forEach((el) => el.remove()));

describe("capture sheet", () => {
  it("renders the quote, label and comment as text", () => {
    void showCaptureSheet(document, input({ quote: "<img src=x onerror=alert(1)>", label: "<b>L</b>" }));
    expect(sheet().querySelector("img")).toBeNull();
    expect(sheet().querySelector("b")).toBeNull();
    expect(sheet().textContent).toContain("<img src=x onerror=alert(1)>");
    expect(sheet().querySelector("h2")!.textContent).toBe("Save excerpt");
  });
  it("returns the comment and the chosen target", async () => {
    const result = showCaptureSheet(document, input());
    sheet().querySelector<HTMLTextAreaElement>("textarea.capture-comment")!.value = "  I disagree.  ";
    sheet().querySelector<HTMLInputElement>('input[value="daily"]')!.click();
    expect(sheet().querySelector(".capture-hint")!.textContent).toBe("Daily/2026-11-14.md");
    save();
    expect(await result).toEqual({ comment: "I disagree.", text: "The sync model assumes a single writer.", target: { kind: "daily" } });
  });
  it("Choose Note… stores the picked path; cancel keeps the old choice", async () => {
    const choose = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("notes/Tasks.md");
    const result = showCaptureSheet(document, input({ chooseNote: choose }));
    const note = sheet().querySelector<HTMLInputElement>('input[value="note"]')!;
    note.click(); await flush();
    expect(sheet().querySelector<HTMLInputElement>('input[value="companion"]')!.checked).toBe(true);
    note.click(); await flush();
    expect(note.checked).toBe(true);
    expect(sheet().querySelector(".capture-hint")!.textContent).toBe("notes/Tasks.md");
    save();
    expect((await result)?.target).toEqual({ kind: "note", relative: "notes/Tasks.md" });
  });
  it("Cancel and Escape resolve null", async () => {
    const first = showCaptureSheet(document, input());
    sheet().querySelector<HTMLButtonElement>("button.capture-cancel")!.click();
    expect(await first).toBeNull();
    const second = showCaptureSheet(document, input());
    sheet().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await second).toBeNull();
    expect(document.querySelector(".capture-sheet")).toBeNull();
  });
  it("a task sheet edits the task text", async () => {
    const result = showCaptureSheet(document, input({ kind: "task", quote: "Verify\nthe writer" }));
    expect(sheet().querySelector("h2")!.textContent).toBe("Save task");
    const field = sheet().querySelector<HTMLInputElement>("input.capture-task")!;
    expect(field.value).toBe("Verify the writer");
    field.value = "Verify single writer";
    save();
    expect((await result)?.text).toBe("Verify single writer");
  });
  it("a task with empty text cannot be saved", async () => {
    void showCaptureSheet(document, input({ kind: "task" }));
    sheet().querySelector<HTMLInputElement>("input.capture-task")!.value = "  ";
    save();
    expect(document.querySelector(".capture-sheet")).not.toBeNull();
  });
  it("a note sheet has no quote and no target choice", () => {
    void showCaptureSheet(document, input({ kind: "note", quote: "" }));
    expect(sheet().querySelector("h2")!.textContent).toBe("Add note");
    expect(sheet().querySelector(".capture-quote")).toBeNull();
    expect(sheet().querySelector('input[type="radio"]')).toBeNull();
  });
  it("clears the empty-task error once the owner types", async () => {
    const done = showCaptureSheet(document, { kind: "task", quote: "", label: "Doc", target: { kind: "daily" }, targetHint: () => "", chooseNote: async () => null });
    document.querySelector<HTMLFormElement>("form.capture-sheet")!.requestSubmit();
    const error = document.querySelector(".capture-error")!;
    expect(error.textContent).toBe("Write the task first.");
    const field = document.querySelector<HTMLInputElement>("input.capture-task")!;
    field.value = "Do it";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    expect(error.textContent).toBe("");
    document.querySelector<HTMLButtonElement>(".capture-cancel")!.click();
    await done;
  });
});
