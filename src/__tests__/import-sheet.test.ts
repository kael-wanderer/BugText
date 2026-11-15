// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { importUI } from "../import/sheet";
import { KEYMAP_COMMANDS } from "../keymap";

const { readFileSync } = (await import("node:fs" as string)) as {
  readFileSync: (path: string, encoding: "utf8") => string;
};

afterEach(() => document.body.replaceChildren());

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`no button ${label}`);
  return found as HTMLButtonElement;
}

function input(label: string): HTMLInputElement {
  const found = [...document.querySelectorAll("label")].find((l) => l.firstChild?.textContent === label);
  return found?.querySelector("input") as HTMLInputElement;
}

function type(field: HTMLInputElement, value: string) {
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

const text = () => document.body.textContent ?? "";

describe("import sheet", () => {
  it("asks for an https address and a save path", async () => {
    const ui = importUI(document.body);
    const answer = ui.ask({ kind: "web", savePath: "", earlier: null });
    expect(document.querySelector("h2")?.textContent).toBe("Import Web Page");
    const address = input("Address");
    expect(input("Save to")).toBeTruthy();
    expect(button("Import").disabled).toBe(true);
    type(address, "http://x");
    expect(text()).toContain("Only https:// addresses can be imported.");
    expect(button("Import").disabled).toBe(true);
    type(address, "https://e.com/a");
    expect(button("Import").disabled).toBe(false);
    type(input("Save to"), "research/a.md");
    address.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await expect(answer).resolves.toEqual({ address: "https://e.com/a", savePath: "research/a.md", again: false });
  });

  it("resolves null on Cancel and on Escape", async () => {
    const ui = importUI(document.body);
    const cancelled = ui.ask({ kind: "web", savePath: "", earlier: null });
    button("Cancel").click();
    await expect(cancelled).resolves.toBeNull();
    const escaped = ui.ask({ kind: "csv", savePath: "a.md", earlier: null });
    document.querySelector(".organize-scrim")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect(escaped).resolves.toBeNull();
  });

  it("offers the earlier import", async () => {
    const ui = importUI(document.body, { label: (path) => path.replace("/f/", "") });
    const earlier = { path: "/f/research/queue-patterns.md", importedAt: "2026-11-03" };
    const open = ui.ask({ kind: "web", address: "https://e.com/q", savePath: "", earlier });
    expect(text()).toContain("Already imported");
    expect(text()).toContain("This address was imported on 3 Nov as research/queue-patterns.md.");
    button("Open Existing").click();
    await expect(open).resolves.toEqual({ open: "/f/research/queue-patterns.md" });
    const again = ui.ask({ kind: "word", savePath: "r.md", earlier: { path: "/f/r.md", importedAt: null } });
    expect(text()).toContain("This file was imported before as r.md.");
    button("Import Again").click();
    await expect(again).resolves.toEqual({ savePath: "r.md", again: true });
  });

  it("shows file sheets without an address", async () => {
    const ui = importUI(document.body);
    void ui.ask({ kind: "word", savePath: "research/report.md", earlier: null });
    expect(document.querySelector("h2")?.textContent).toBe("Import Word Document");
    expect(input("Address")).toBeFalsy();
    expect(input("Save to").value).toBe("research/report.md");
    expect(button("Import").disabled).toBe(false);
    button("Cancel").click();
    void ui.ask({ kind: "csv", savePath: "d.md", earlier: null });
    expect(document.querySelector("h2")?.textContent).toBe("Import CSV");
  });

  it("shows progress with the buttons disabled", () => {
    const ui = importUI(document.body);
    void ui.ask({ kind: "csv", savePath: "d.md", earlier: null });
    button("Import").click();
    ui.busy("Reading the file…");
    expect(text()).toContain("Reading the file…");
    for (const b of document.querySelectorAll<HTMLButtonElement>(".organize-actions button")) expect(b.disabled).toBe(true);
  });

  it("shows the result with its problems", () => {
    const openNote = vi.fn();
    const ui = importUI(document.body, { label: (path) => path.replace("/f/", ""), openNote });
    ui.result({ path: "/f/research/queue-patterns.md", problems: ["a.png is not a valid image.", "b.txt was left out."] });
    expect(text()).toContain("Imported research/queue-patterns.md");
    expect([...document.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["a.png is not a valid image.", "b.txt was left out."]);
    button("Open Note").click();
    expect(openNote).toHaveBeenCalledWith("/f/research/queue-patterns.md");
    expect(document.querySelector(".organize-scrim")).toBeNull();
    ui.result({ path: "/f/x.md", problems: [] });
    expect(document.querySelector("ul")).toBeNull();
    button("Done").click();
    expect(document.querySelector(".organize-scrim")).toBeNull();
  });

  it("shows a failure", () => {
    const ui = importUI(document.body);
    ui.fail("This address is not on the public internet.");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("This address is not on the public internet.");
  });

  it("renders untrusted text as text", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const ui = importUI(document.body, { label: (path) => path });
    void ui.ask({ kind: "word", savePath: evil, earlier: { path: evil, importedAt: null } });
    ui.result({ path: evil, problems: [evil] });
    ui.fail(evil);
    expect(document.querySelector("img")).toBeNull();
    expect(text()).toContain(evil);
  });
});

describe("import commands", () => {
  const menu = readFileSync("src-tauri/src/menu.rs", "utf8");
  it("exist in the keymap and the native menu with the same ids", () => {
    for (const [id, label] of [["file.import_web", "Web Page…"], ["file.import_word", "Word Document…"], ["file.import_csv", "CSV…"]]) {
      expect(KEYMAP_COMMANDS.find((command) => command.id === id)).toMatchObject({ label, category: "File", default: "", scope: "menu" });
      expect(menu).toContain(`MenuItemBuilder::with_id("${id}", "${label}")`);
    }
  });
});
