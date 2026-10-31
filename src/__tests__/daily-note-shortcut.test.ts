// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { transpile } from "typescript";
import mainSource from "../main.ts?raw";
import { KEYMAP_COMMANDS, matchAccelerator, resolveAccelerator } from "../keymap";
import { dailyNotePlan } from "../notes/daily";

// Exercise the actual bootstrap listener and action binding without starting Tauri.
function installShortcut(openDailyNote: () => void = vi.fn()) {
  const start = mainSource.indexOf("const appKeyActions:");
  const end = mainSource.indexOf("\nfunction applyZoom", start);
  const add = vi.spyOn(window, "addEventListener");
  const noop = () => {};
  new Function("window", "resolvedAccel", "matchAccelerator", "openDailyNote",
    "showActiveHistory", "snapshotActiveDocument", "newAIChat", transpile(mainSource.slice(start, end)))(
    window,
    (id: string) => {
      const command = KEYMAP_COMMANDS.find(c => c.id === id);
      return command ? resolveAccelerator(command, {}) : "";
    },
    matchAccelerator, openDailyNote, noop, noop, noop,
  );
  const listeners = [...add.mock.calls];
  add.mockRestore();
  return { openDailyNote, cleanup: () => {
    for (const [type, listener, options] of listeners) window.removeEventListener(type, listener, options);
  } };
}

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

function dailyKey(overrides: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: "D", code: "KeyD", shiftKey: true, metaKey: true, bubbles: true, cancelable: true, ...overrides });
}

describe("daily note shortcut", () => {
  it("dispatches Shift-Command-D to the daily note action", () => {
    const { openDailyNote, cleanup } = installShortcut();
    try {
      const event = dailyKey();
      document.body.dispatchEvent(event);
      expect(openDailyNote).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    } finally { cleanup(); }
  });

  it("still fires with an input focused, like other app shortcuts", () => {
    const { openDailyNote, cleanup } = installShortcut();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    try {
      const event = dailyKey();
      input.dispatchEvent(event);
      expect(document.activeElement).toBe(input);
      expect(openDailyNote).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    } finally { cleanup(); }
  });

  it.each(["d", "D"])("accepts key %s with physical code KeyD", key => {
    const { openDailyNote, cleanup } = installShortcut();
    try {
      document.body.dispatchEvent(dailyKey({ key }));
      expect(openDailyNote).toHaveBeenCalledOnce();
    } finally { cleanup(); }
  });

  it.each([
    ["Command-D", { key: "d", shiftKey: false }],
    ["Shift-D", { metaKey: false }],
    ["Option-Command-D (macOS Dock)", { key: "∂", shiftKey: false, altKey: true }],
    ["Option-Shift-Command-D", { key: "Î", altKey: true }],
  ] as const)("does not open the daily note for %s", (_name, modifiers) => {
    const { openDailyNote, cleanup } = installShortcut();
    try {
      const event = dailyKey(modifiers);
      document.body.dispatchEvent(event);
      expect(openDailyNote).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    } finally { cleanup(); }
  });

  it("shows the no-folder toast without creating or opening a file", () => {
    const showToast = vi.fn(), invoke = vi.fn(), createFromTemplate = vi.fn(), doOpenPath = vi.fn();
    const start = mainSource.indexOf("async function openDailyNote()");
    const end = mainSource.indexOf("\nasync function doOpenPath", start);
    const openDailyNote = new Function("getState", "showToast", "dailyNotePlan", "invoke", "createFromTemplate", "doOpenPath",
      transpile(`${mainSource.slice(start, end)}\nreturn openDailyNote;`))(
      () => ({ folder: null }), showToast, dailyNotePlan, invoke, createFromTemplate, doOpenPath,
    ) as () => void;
    const { cleanup } = installShortcut(openDailyNote);
    try {
      document.body.dispatchEvent(dailyKey());
      expect(showToast).toHaveBeenCalledExactlyOnceWith("Open a folder to use the daily note.");
      expect(invoke).not.toHaveBeenCalled();
      expect(createFromTemplate).not.toHaveBeenCalled();
      expect(doOpenPath).not.toHaveBeenCalled();
    } finally { cleanup(); }
  });
});
