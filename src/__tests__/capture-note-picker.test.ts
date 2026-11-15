// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pickNote } from "../capture/note-picker";

const files = ["Tasks.md", "notes/Reading list.md", "docs/arch.md", "<img src=x>.md"];
const filter = () => document.querySelector<HTMLInputElement>(".capture-picker input")!;
const rows = () => [...document.querySelectorAll<HTMLElement>(".capture-picker li")].map((li) => li.textContent);

describe("note picker", () => {
  it("lists notes as text", () => {
    void pickNote(document, files);
    expect(rows()).toEqual(files);
    expect(document.querySelector(".capture-picker img")).toBeNull();
    filter().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  it("filters by substring, case-insensitive, and picks with Enter", async () => {
    const result = pickNote(document, files);
    filter().value = "READ";
    filter().dispatchEvent(new Event("input"));
    expect(rows()).toEqual(["notes/Reading list.md"]);
    filter().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(await result).toBe("notes/Reading list.md");
    expect(document.querySelector(".capture-picker")).toBeNull();
  });
  it("picks a row by click", async () => {
    const result = pickNote(document, files);
    document.querySelectorAll<HTMLElement>(".capture-picker li")[2].click();
    expect(await result).toBe("docs/arch.md");
  });
  it("Escape resolves null", async () => {
    const result = pickNote(document, files);
    filter().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await result).toBeNull();
  });
});
