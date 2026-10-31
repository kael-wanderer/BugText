import { expect, it } from "vitest";
import { FRESH_SETTINGS_JSON, parseSettings } from "../settings";
import { shouldShowHint, isFolderEmpty } from "../empty-states/rules";
import { keyHint } from "../empty-states/key-hint";
it("shows the first-run hint only for explicit fresh settings", () => {
  expect(parseSettings(FRESH_SETTINGS_JSON).onboarding.hintDismissed).toBe(false);
  for (const raw of ["{}", '{"theme":"dark"}', '{"onboarding":"yes"}', "bad json"]) expect(parseSettings(raw).onboarding.hintDismissed).toBe(true);
  expect(parseSettings(JSON.stringify(parseSettings(FRESH_SETTINGS_JSON))).onboarding.hintDismissed).toBe(false);
  const base = { dismissed: false, folder: null, tabCount: 0, loading: false, settingsOpen: false, recoveryOpen: false };
  expect(shouldShowHint(base)).toBe(true);
  for (const change of [{ dismissed: true }, { folder: "/r" }, { tabCount: 1 }, { loading: true }, { settingsOpen: true }, { recoveryOpen: true }]) expect(shouldShowHint({ ...base, ...change })).toBe(false);
});
it("identifies visibly empty folders and displays resolved key hints", () => {
  expect(isFolderEmpty([], true)).toBe(true); expect(isFolderEmpty([{ name: ".DS_Store" }], false)).toBe(true);
  expect(isFolderEmpty([{ name: ".DS_Store" }], true)).toBe(false); expect(isFolderEmpty([{ name: "a.md" }], false)).toBe(false);
  expect(keyHint("file.new", {})).toBe("⌘N"); expect(keyHint("file.new", { "file.new": "Cmd+Shift+K" })).toBe("⇧⌘K");
  expect(keyHint("file.new", { "file.new": "" })).toBe(""); expect(keyHint("unknown", {})).toBe("");
});
