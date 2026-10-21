import { describe, expect, it } from "vitest";
import {
  acceleratorFromEvent,
  conflictingIds,
  formatAccelerator,
  matchAccelerator,
  menuAccelerators,
  resolveAccelerator,
  KEYMAP_COMMANDS,
} from "../keymap";

function key(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
  } as KeyboardEvent;
}

describe("matchAccelerator", () => {
  it("matches a Cmd+letter accelerator", () => {
    expect(matchAccelerator(key({ key: "k", metaKey: true }), "CmdOrCtrl+K")).toBe(true);
    expect(matchAccelerator(key({ key: "K", metaKey: true }), "CmdOrCtrl+K")).toBe(true);
  });

  it("requires every modifier to match exactly", () => {
    expect(matchAccelerator(key({ key: "n", metaKey: true }), "CmdOrCtrl+Shift+N")).toBe(false);
    expect(matchAccelerator(key({ key: "n", metaKey: true, shiftKey: true }), "CmdOrCtrl+Shift+N")).toBe(true);
  });

  it("matches symbol and Enter keys", () => {
    expect(matchAccelerator(key({ key: "=", metaKey: true }), "CmdOrCtrl+=")).toBe(true);
    expect(matchAccelerator(key({ key: "-", metaKey: true }), "CmdOrCtrl+-")).toBe(true);
    expect(matchAccelerator(key({ key: "Enter", metaKey: true }), "CmdOrCtrl+Enter")).toBe(true);
  });

  it("does not match when an extra modifier is held", () => {
    expect(matchAccelerator(key({ key: "k", metaKey: true, altKey: true }), "CmdOrCtrl+K")).toBe(false);
  });

  it("returns false for an empty accelerator", () => {
    expect(matchAccelerator(key({ key: "k", metaKey: true }), "")).toBe(false);
  });
});

describe("acceleratorFromEvent", () => {
  it("builds a Tauri accelerator from an event", () => {
    expect(acceleratorFromEvent(key({ key: "n", metaKey: true, shiftKey: true }))).toBe("CmdOrCtrl+Shift+N");
    expect(acceleratorFromEvent(key({ key: "=", metaKey: true }))).toBe("CmdOrCtrl+=");
  });

  it("ignores bare modifier presses", () => {
    expect(acceleratorFromEvent(key({ key: "Shift", shiftKey: true }))).toBeNull();
    expect(acceleratorFromEvent(key({ key: "Meta", metaKey: true }))).toBeNull();
  });
});

describe("formatAccelerator", () => {
  it("renders symbols", () => {
    expect(formatAccelerator("CmdOrCtrl+Shift+N")).toBe("⌘⇧N");
    expect(formatAccelerator("CmdOrCtrl+Enter")).toBe("⌘↩");
    expect(formatAccelerator("")).toBe("—");
  });
});

describe("resolveAccelerator / menuAccelerators", () => {
  const cmd = KEYMAP_COMMANDS.find((c) => c.id === "file.save")!;

  it("falls back to the default when no override", () => {
    expect(resolveAccelerator(cmd, {})).toBe("CmdOrCtrl+S");
  });

  it("honors an override, including an empty (unbound) override", () => {
    expect(resolveAccelerator(cmd, { "file.save": "CmdOrCtrl+Alt+S" })).toBe("CmdOrCtrl+Alt+S");
    expect(resolveAccelerator(cmd, { "file.save": "" })).toBe("");
  });

  it("returns only menu-scoped commands", () => {
    const map = menuAccelerators({});
    expect(map["file.save"]).toBe("CmdOrCtrl+S");
    expect(map["palette.open"]).toBeUndefined();
  });
});

describe("conflictingIds", () => {
  it("reports no conflicts for the default keymap", () => {
    expect(conflictingIds({}).size).toBe(0);
  });

  it("flags both commands when an override collides", () => {
    const conflicts = conflictingIds({ "file.save": "CmdOrCtrl+O" });
    expect(conflicts.has("file.save")).toBe(true);
    expect(conflicts.has("file.open")).toBe(true);
  });

  it("ignores unbound (empty) accelerators", () => {
    const conflicts = conflictingIds({ "file.save": "", "file.open": "" });
    expect(conflicts.size).toBe(0);
  });
});

describe("app.settings command", () => {
  it("keymap has app.settings on Cmd+,", () => {
    expect(KEYMAP_COMMANDS.find((c) => c.id === "app.settings")?.default).toBe("CmdOrCtrl+,");
  });
});
