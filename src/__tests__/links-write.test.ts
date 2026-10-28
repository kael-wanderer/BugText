// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { completionSource, configureLinkCompletion } from "../links/complete";
import { createLinkIndex, parseNote } from "../links/index";
import { linkMarkup, showInsertLinkPicker } from "../links/insert-picker";
const note = parseNote("/r/meetings/2026-10-28 Retro.md", "# Retro title\n## Action items");
async function setup(enabled = true) {
  const index = createLinkIndex(async () => ({ notes: [note], skipped: [] }));
  await index.ensure("/r");
  configureLinkCompletion({ index, context: () => ({ path: "/r/notes/a.md", untitled: false }), enabled: () => enabled });
  return index;
}
const context = (doc: string) => new CompletionContext(EditorState.create({ doc }), doc.length, true);
describe("writing note links", () => {
  it("completes relative angle destinations and headings", async () => {
    await setup();
    const result = await completionSource("a")(context("[a](ret"));
    expect(result?.options[0].apply).toBe("<../meetings/2026-10-28 Retro.md>)");
    const heading = await completionSource("a")(context("[a](<../meetings/2026-10-28 Retro.md#act"));
    expect(heading?.options[0].apply).toBe("<../meetings/2026-10-28 Retro.md#action-items>)");
    const ref = await completionSource("a")(context("[id]: ret"));
    expect(ref?.options[0].apply).toBe("<../meetings/2026-10-28 Retro.md>");
  });
  it("matches notes on their path inside the folder, not the folder itself", async () => {
    const index = createLinkIndex(async () => ({ notes: [parseNote("/long/x/sre.md", ""), parseNote("/long/x/long.md", "")], skipped: [] }));
    await index.ensure("/long/x");
    configureLinkCompletion({ index, context: () => ({ path: "/long/x/a.md", untitled: false }), enabled: () => true });
    const result = await completionSource("a")(context("[a](long"));
    expect(result?.options.map((option) => option.label)).toEqual(["long.md"]);
  });
  it("respects disabled suggestions and code blocks", async () => {
    await setup(false); expect(await completionSource("a")(context("[a](ret"))).toBeNull();
    await setup(); expect(await completionSource("a")(context("```\n[a](ret"))).toBeNull();
  });
  it("uses selected text or first H1 and escapes Markdown label syntax", () => {
    expect(linkMarkup("the retro", note, "/r/notes/a.md")).toBe("[the retro](<../meetings/2026-10-28 Retro.md>)");
    expect(linkMarkup("", note, "/r/a.md")).toContain("[Retro title]");
    expect(linkMarkup("[a]", note, "/r/a.md")).toContain("[\\[a\\]]");
  });
  it("renders HTML names as text in the picker and supports Tab headings", async () => {
    const bad = parseNote('/r/<img src=x onerror=evil>.md', "# <script>evil</script>\n## Heading");
    const index = createLinkIndex(async () => ({ notes: [bad], skipped: [] })); await index.ensure("/r");
    let inserted = "";
    await showInsertLinkPicker({ index, path: "/r/a.md", untitled: true, selection: "", insert: (text) => { inserted = text; } });
    const sheet = document.querySelector<HTMLElement>(".link-picker")!;
    expect(sheet.querySelector("img,script")).toBeNull();
    expect(sheet.textContent).toContain("Save this note");
    sheet.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    sheet.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(inserted).toContain("#scriptevilscript");
  });
});
