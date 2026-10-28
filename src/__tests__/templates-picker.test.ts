// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { showTemplatePicker, type PickerDeps } from "../templates/picker";

const NOW = new Date(2026, 9, 28, 14, 5);
const MEETING = "<!-- template\nfolder: meetings\nname: {{date}} {{title}}\n-->\n# {{title}}\n{{cursor}}\n";

function setup(overrides: Partial<PickerDeps> = {}, files: Record<string, string> = { "Meeting notes": MEETING }) {
  const host = document.createElement("div");
  document.body.append(host);
  const deps: PickerDeps = {
    host,
    folder: "/notes",
    targetDir: null,
    format: "YYYY-MM-DD",
    defaultFolder: "",
    lastUsed: "",
    now: () => NOW,
    list: async () => Object.keys(files).map((name) => ({ name, path: `/t/${name}.md`, size: files[name].length })),
    read: async (path) => files[path.slice(3, -3)],
    create: vi.fn(async (args) => `/notes/${args.relativeDir}/${args.stem}.md`),
    onCreated: vi.fn(),
    onUntitled: vi.fn(),
    onUsed: vi.fn(),
    openTemplatesFolder: vi.fn(),
    newTemplate: vi.fn(),
    ...overrides,
  };
  return { host, deps };
}

const q = <T extends HTMLElement>(host: HTMLElement, selector: string) => host.querySelector<T>(selector)!;
const type = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new Event("input")); };
const key = (el: HTMLElement, name: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => { document.body.replaceChildren(); });

describe("template picker", () => {
  it("updates the destination line as the title changes", async () => {
    const { host, deps } = setup();
    await showTemplatePicker(deps);
    type(q(host, ".tpl-title"), "Weekly sync");
    expect(q(host, ".tpl-dest").textContent).toBe("meetings/2026-10-28 Weekly sync.md");
    expect(q(host, ".tpl-preview").textContent).toContain("# Weekly sync");
  });

  it("Enter creates with the destination and cursor", async () => {
    const { host, deps } = setup();
    await showTemplatePicker(deps);
    type(q(host, ".tpl-title"), "a/b:c?");
    key(q(host, ".tpl-title"), "Enter");
    await flush();
    expect(deps.create).toHaveBeenCalledWith({ folder: "/notes", relativeDir: "meetings", stem: "2026-10-28 a-b-c-", contents: "# a/b:c?\n\n" });
    expect(deps.onCreated).toHaveBeenCalledWith("/notes/meetings/2026-10-28 a-b-c-.md", 9);
    expect(deps.onUsed).toHaveBeenCalledWith("Meeting notes");
    expect(host.querySelector(".tpl-scrim")).toBeNull();
  });

  it("Esc closes without creating", async () => {
    const { host, deps } = setup();
    await showTemplatePicker(deps);
    key(q(host, ".tpl-title"), "Escape");
    expect(host.querySelector(".tpl-scrim")).toBeNull();
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("renders untrusted names and titles as text", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    const { host, deps } = setup({}, { [evil]: `# {{title}}\n` });
    await showTemplatePicker(deps);
    type(q(host, ".tpl-title"), "<b>hi</b>");
    expect(host.querySelector("img, b")).toBeNull();
    expect(q(host, ".tpl-name").textContent).toBe(evil);
    expect(q(host, ".tpl-preview").textContent).toContain("<b>hi</b>");
    expect(q(host, ".tpl-dest").textContent).toBe("-b-hi--b-.md");
  });

  it("arrow keys switch templates and the last used one starts selected", async () => {
    const files = { "Alpha": "a\n", "Beta": "b\n" };
    const { host, deps } = setup({ lastUsed: "Beta" }, files);
    await showTemplatePicker(deps);
    expect(q(host, ".tpl-item.sel .tpl-name").textContent).toBe("Beta");
    key(q(host, ".tpl-title"), "ArrowUp");
    expect(q(host, ".tpl-item.sel .tpl-name").textContent).toBe("Alpha");
  });

  it("without a folder it opens Untitled text and writes nothing", async () => {
    const { host, deps } = setup({ folder: null });
    await showTemplatePicker(deps);
    type(q(host, ".tpl-title"), "Hi");
    expect(q(host, ".tpl-dest").textContent).toBe("Not saved yet — no folder open");
    key(q(host, ".tpl-title"), "Enter");
    await flush();
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.onUntitled).toHaveBeenCalledWith("# Hi\n\n", 5);
  });

  it("disables Create for a folder that leaves the open folder", async () => {
    const { host, deps } = setup({}, { Bad: "<!-- template\nfolder: ../outside\n-->\nx" });
    await showTemplatePicker(deps);
    expect(q(host, ".tpl-dest").textContent).toBe("Template folder must be inside the open folder.");
    expect(q<HTMLButtonElement>(host, ".tpl-btn.primary").disabled).toBe(true);
    key(q(host, ".tpl-title"), "Enter");
    await flush();
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("uses the Explorer folder instead of the header's", async () => {
    const { host, deps } = setup({ targetDir: "projects/alpha" });
    await showTemplatePicker(deps);
    type(q(host, ".tpl-title"), "Sync");
    expect(q(host, ".tpl-dest").textContent).toBe("projects/alpha/2026-10-28 Sync.md");
  });

  it("shows the empty state with both actions", async () => {
    const { host, deps } = setup({}, {});
    await showTemplatePicker(deps);
    expect(host.textContent).toContain("No templates yet");
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".tpl-empty button")];
    buttons[0].click();
    expect(deps.openTemplatesFolder).toHaveBeenCalled();
  });

  it("shows a create failure without file contents", async () => {
    const { host, deps } = setup({ create: vi.fn(async () => { throw "Could not create the file."; }) });
    await showTemplatePicker(deps);
    key(q(host, ".tpl-title"), "Enter");
    await flush();
    expect(q(host, ".tpl-dest").textContent).toBe("Could not create the file.");
    expect(host.querySelector(".tpl-scrim")).not.toBeNull();
  });
});
