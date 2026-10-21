import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizeThemeName,
  parseSettings,
  tryParseSettings,
  THEME_OPTIONS,
} from "../settings";

describe("parseSettings", () => {
  it("returns defaults for invalid JSON", () => {
    expect(parseSettings("{ not json")).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for empty object", () => {
    expect(parseSettings("{}")).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial settings over defaults", () => {
    const settings = parseSettings('{ "theme": "nord", "main": { "size": 20 } }');
    expect(settings.theme).toBe("nord");
    expect(settings.main.size).toBe(20);
    expect(settings.main.font).toBe(DEFAULT_SETTINGS.main.font);
    expect(settings.explorer).toEqual(DEFAULT_SETTINGS.explorer);
  });

  it("falls back to dark for unknown theme", () => {
    expect(parseSettings('{ "theme": "neon" }').theme).toBe("dark");
  });

  it("accepts human-readable theme names", () => {
    expect(parseSettings('{ "theme": "Everforest Dark" }').theme).toBe(
      "everforest-dark",
    );
    expect(parseSettings('{ "theme": "Catppuccin Mocha" }').theme).toBe(
      "catppuccin-mocha",
    );
  });

  it("normalizes every installed theme option", () => {
    for (const option of THEME_OPTIONS) {
      expect(normalizeThemeName(option.label)).toBe(option.id);
      expect(normalizeThemeName(option.id)).toBe(option.id);
    }
  });

  it("clamps size into 10..28", () => {
    expect(parseSettings('{ "main": { "size": 200 } }').main.size).toBe(28);
    expect(parseSettings('{ "main": { "size": 2 } }').main.size).toBe(10);
  });

  it("ignores non-boolean restoreSession", () => {
    expect(parseSettings('{ "restoreSession": "yes" }').restoreSession).toBe(true);
  });

  it("defaults update mode to manual", () => {
    expect(parseSettings("{}").updateMode).toBe("manual");
  });

  it("migrates the legacy automatic update preference", () => {
    expect(parseSettings('{ "autoUpdate": true }').updateMode).toBe("auto");
    expect(parseSettings('{ "autoUpdate": false }').updateMode).toBe("manual");
    expect(parseSettings('{ "autoUpdate": "yes" }').updateMode).toBe("manual");
  });

  it("accepts an explicit update mode with precedence over legacy data", () => {
    expect(parseSettings('{ "updateMode": "auto" }').updateMode).toBe("auto");
    expect(
      parseSettings('{ "updateMode": "manual", "autoUpdate": true }').updateMode,
    ).toBe("manual");
  });

  it("defaults workspace context on with five retrieved chunks", () => {
    const settings = parseSettings("{}");
    expect(settings.workspaceContext).toBe(true);
    expect(settings.workspaceContextK).toBe(5);
  });

  it("respects workspace context settings", () => {
    const settings = parseSettings(
      '{ "workspaceContext": false, "workspaceContextK": 8 }',
    );
    expect(settings.workspaceContext).toBe(false);
    expect(settings.workspaceContextK).toBe(8);
  });
});

describe("soft wrap", () => {
  it("defaults to window-width wrap, column 80", () => {
    const s = parseSettings("{}");
    expect(s.softWrapMode).toBe("window");
    expect(s.wrapColumn).toBe(80);
  });
  it("accepts a guide mode and column", () => {
    const s = parseSettings('{"softWrapMode":"guide","wrapColumn":100}');
    expect(s.softWrapMode).toBe("guide");
    expect(s.wrapColumn).toBe(100);
  });
  it("clamps an out-of-range column", () => {
    expect(parseSettings('{"wrapColumn":5}').wrapColumn).toBe(20);
    expect(parseSettings('{"wrapColumn":500}').wrapColumn).toBe(200);
  });
});

describe("tryParseSettings", () => {
  it("returns null on invalid JSON", () => {
    expect(tryParseSettings("{ not json")).toBeNull();
    expect(tryParseSettings("[]")).toBeNull();
  });
  it("parses valid JSON like parseSettings", () => {
    const raw = JSON.stringify({ theme: "nord", wrapColumn: 100 });
    expect(tryParseSettings(raw)).toEqual(parseSettings(raw));
  });
});

describe("appIcon", () => {
  it("parses appIcon with fallback", () => {
    expect(parseSettings(JSON.stringify({ appIcon: "nib-bug" })).appIcon).toBe("nib-bug");
    for (const v of ["", "../etc/passwd", 3, null, "NIB-BUG"]) {
      expect(parseSettings(JSON.stringify({ appIcon: v })).appIcon).toBe("page-bug");
    }
    expect(parseSettings("{}").appIcon).toBe("page-bug");
  });
});
