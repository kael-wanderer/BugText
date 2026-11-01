// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { countWords, cursorPosition, cursorLabel, saveStateText } from "../status-bar/model";
import { createStatusBar, type StatusBarState } from "../status-bar/view";
import { parseSettings } from "../settings";
import { editingPage } from "../settings-screen/page-editing";
import type { ScreenDeps } from "../settings-screen/screen";
import { searchSettings } from "../settings-screen/registry";



const note: StatusBarState = {
  pathOrName: "note.md", enabled: true, cursor: { line: 12, column: 4 },
  selection: "", words: 1204, dirty: false, recovered: false, largeFolder: false, readingTime: false, noteGoal: null, session: null,
};

function fixture() {
  const host = document.createElement("div");
  const goToLine = vi.fn();
  return { host, goToLine, bar: createStatusBar(host, goToLine) };
}

describe("status bar public behavior", () => {
  it("uses Go to Line's one-based head position after moves, paste and undo", () => {
    let state = EditorState.create({ doc: "first\nsecond", extensions: [history()] });
    expect(cursorLabel(cursorPosition(state))).toBe("Ln 1, Col 1");
    state = state.update({ selection: { anchor: 8 } }).state;
    expect(cursorLabel(cursorPosition(state))).toBe("Ln 2, Col 3");
    state = state.update(state.replaceSelection("new\nline"), { userEvent: "input.paste" }).state;
    expect(cursorLabel(cursorPosition(state))).toBe("Ln 3, Col 5");
    expect(undo({ state, dispatch: tr => { state = tr.state; } })).toBe(true);
    expect(cursorLabel(cursorPosition(state))).toBe("Ln 2, Col 3");
    state = state.update({ selection: { anchor: 10, head: 6 } }).state;
    expect(cursorLabel(cursorPosition(state))).toBe("Ln 2, Col 1");
  });

  it("shares preview counting including front matter and code fences", () => {
    const source = '---\ntitle: A note\n---\nHello world\n```js\nconst x = 1;\n```';
    expect(countWords(source)).toBe(13);
    const { host, bar } = fixture();
    bar.update({ ...note, words: countWords(source) });
    expect(host.textContent).toContain("13 words");
    expect(countWords(" \n\t")).toBe(0);
  });

  it.each([[false, false, "Saved"], [true, false, "Unsaved"], [true, true, "Recovered draft"], [false, true, "Recovered draft"]] as const)(
    "reports dirty=%s recovered=%s as %s", (dirty, recovered, expected) => {
      expect(saveStateText(dirty, recovered)).toBe(expected);
      const { host, bar } = fixture();
      bar.update({ ...note, dirty, recovered });
      const save = host.querySelector('[role="status"]')!;
      expect(save.textContent).toBe(expected);
      expect(save.getAttribute("aria-live")).toBe("polite");
      expect(host.querySelector('[aria-label="Go to line"]')!.closest('[aria-live]')).toBeNull();
      expect(save.tagName).not.toBe("BUTTON");
    },
  );

  it("shows selection counts, updates the cursor, and opens Go to Line", () => {
    const { host, bar, goToLine } = fixture();
    bar.update({ ...note, selection: "three open risks" });
    expect(host.textContent).toContain("3 words · 16 chars selected");
    (host.querySelector('[aria-label="Go to line"]') as HTMLButtonElement).click();
    expect(goToLine).toHaveBeenCalledOnce();
    bar.update({ ...note, cursor: { line: 2, column: 1 } });
    expect(host.textContent).toContain("Ln 2, Col 1");
    expect(host.textContent).not.toContain("selected");
  });

  it("shows reading time and opens goals", () => {
    const host = document.createElement("div"), onGoals = vi.fn();
    const bar = createStatusBar(host, vi.fn(), vi.fn(), onGoals);
    bar.update({ ...note, readingTime: true });
    const button = host.querySelector('[aria-label="Writing goals"]') as HTMLButtonElement;
    expect(button.textContent).toBe("1,204 words · ≈ 6 min"); button.click(); expect(onGoals).toHaveBeenCalledWith(button);
  });
  it("renders note and session goals", () => {
    const { host, bar } = fixture();
    bar.update({ ...note, noteGoal: { words: 820, goal: 1500 }, session: { written: 320, goal: 500 } });
    expect(host.textContent).toContain("820 / 1,500"); expect(host.textContent).toContain("Session 320 / 500");
    expect(host.querySelectorAll("svg")).toHaveLength(2);
    bar.update({ ...note, noteGoal: { words: 1512, goal: 1500 } });
    expect(host.querySelector(".done")?.textContent).toBe("✓ 1,512 / 1,500");
  });

  it.each(["file.pdf", "file.html", "script.ts", null])("removes the bar for %s and restores it for Markdown", pathOrName => {
    const { host, bar } = fixture();
    bar.update(note);
    bar.update({ ...note, pathOrName });
    expect(host.childElementCount).toBe(0);
    bar.update(note);
    expect(host.textContent).toContain("1,204 words");
  });

  it("removes the element when disabled, leaving no layout wrapper", () => {
    const { host, bar } = fixture();
    bar.update({ ...note, pathOrName: "note.txt" });
    expect(host.childElementCount).toBe(1);
    bar.update({ ...note, enabled: false });
    expect(host.childNodes.length).toBe(0);
    bar.update(note);
    expect(host.childElementCount).toBe(1);
  });

  it("marks the document while the bar shows, so the footer drops its duplicate count and cursor", () => {
    const { bar } = fixture();
    bar.update(note);
    expect(document.documentElement.classList.contains("status-bar-active")).toBe(true);
    bar.update({ ...note, enabled: false });
    expect(document.documentElement.classList.contains("status-bar-active")).toBe(false);
    bar.update({ ...note, pathOrName: "scan.pdf" });
    expect(document.documentElement.classList.contains("status-bar-active")).toBe(false);
  });

  it("never parses markup-like note or file text", () => {
    const source = '<img src=x onerror=alert(1)>';
    const { host, bar } = fixture();
    bar.update({ ...note, pathOrName: source + '.md', words: countWords(source), selection: source });
    expect(host.textContent).toContain("3 words");
    expect(host.textContent).toContain("3 words · 28 chars selected");
    expect(host.querySelector("img, script, [onerror]")).toBeNull();
  });

  it("keeps separate window displays and accepts active-pane changes", () => {
    const first = fixture(), second = fixture();
    first.bar.update(note);
    second.bar.update({ ...note, words: 2, dirty: true });
    expect(first.host.textContent).toContain("1,204 words");
    expect(second.host.textContent).toContain("2 words");
    first.bar.update({ ...note, words: 5, cursor: { line: 3, column: 2 }, recovered: true });
    expect(first.host.textContent).toContain("Ln 3, Col 2");
    expect(first.host.textContent).toContain("Recovered draft");
    expect(second.host.textContent).toContain("Unsaved");
  });

  it("defaults on, persists off, and exposes a searchable Editing toggle", () => {
    let settings = parseSettings('{}');
    expect(settings.showStatusBar).toBe(true);
    expect(parseSettings('{"showStatusBar":false}').showStatusBar).toBe(false);
    const host = document.createElement("div");
    editingPage.render(host, {
      getSettings: () => settings,
      onSettingsChange: next => { settings = next; },
    } as ScreenDeps);
    const toggle = host.querySelector('[aria-label="Show status bar"]') as HTMLInputElement;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(settings.showStatusBar).toBe(false);
    expect(searchSettings("Show status bar").some(hit => hit.page === "editing")).toBe(true);
  });
});
