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

  it("keeps existing themes and explorer sizes when adding appearance preferences", () => {
    const settings = parseSettings('{"theme":"nord","explorer":{"size":19}}');
    expect(settings.darkTheme).toBe("nord");
    expect(settings.explorer.size).toBe(19);
    expect(settings.interface.size).toBe(14);
  });

  it("validates new appearance fields and preserves system dark choice", () => {
    const settings = parseSettings('{"theme":"system","darkTheme":"everforest-dark","sidebarLook":"tinted","interface":{"size":100}}');
    expect(settings.darkTheme).toBe("everforest-dark");
    expect(settings.sidebarLook).toBe("tinted");
    expect(settings.interface.size).toBe(28);
    expect(parseSettings('{"darkTheme":"light","sidebarLook":"invalid"}').darkTheme).toBe("dark");
  });

  it("round-trips independent light and dark choices in System mode", () => {
    const settings = parseSettings('{"theme":"system","darkTheme":"dracula","lightTheme":"solarized-light"}');
    expect(settings.darkTheme).toBe("dracula");
    expect(settings.lightTheme).toBe("solarized-light");
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
    expect(parseSettings('{"theme":"catppuccin-latte"}').lightTheme).toBe("catppuccin-latte");
    expect(parseSettings('{"darkTheme":"ayu-light","lightTheme":"nord"}').darkTheme).toBe("dark");
    expect(parseSettings('{"lightTheme":"nord"}').lightTheme).toBe("light");
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
      expect(parseSettings(JSON.stringify({ appIcon: v })).appIcon).toBe("bt-lettermark");
    }
    expect(parseSettings("{}").appIcon).toBe("bt-lettermark");
  });

  it("reads image settings and refuses unsafe folders", () => {
    expect(parseSettings("{}").images).toEqual({ folder: "assets", pasteName: "note", dropMode: "copy" });
    expect(
      parseSettings(JSON.stringify({ images: { folder: "img/shots", pasteName: "image", dropMode: "open" } })).images,
    ).toEqual({ folder: "img/shots", pasteName: "image", dropMode: "open" });
    for (const folder of ["../x", "/abs", "a/b/c", 7]) {
      expect(parseSettings(JSON.stringify({ images: { folder } })).images.folder).toBe("assets");
    }
  });
});


describe("sync scroll", () => {
  it("defaults off and accepts only true", () => {
    expect(parseSettings('{}').syncScroll).toBe(false);
    expect(parseSettings('{"syncScroll":true}').syncScroll).toBe(true);
    expect(parseSettings('{"syncScroll":"true"}').syncScroll).toBe(false);
  });
});

describe("table settings", () => {
  it("defaults both table options on", () => {
    expect(parseSettings("{}").tables).toEqual({ formatOnEdit: true, pasteAsTable: true });
  });

  it("turns an option off only for an explicit false", () => {
    expect(parseSettings('{"tables":{"formatOnEdit":false,"pasteAsTable":"no"}}').tables).toEqual({
      formatOnEdit: false,
      pasteAsTable: true,
    });
    expect(parseSettings('{"tables":7}').tables).toEqual({ formatOnEdit: true, pasteAsTable: true });
  });
});

describe("templates settings", () => {
  const defaults = { folder: "", defaultFolder: "", dateFormat: "YYYY-MM-DD", quickTarget: "daily", inboxFile: "Inbox.md", lastUsed: "" };

  it("defaults when missing or malformed", () => {
    expect(parseSettings("{}").templates).toEqual(defaults);
    expect(parseSettings('{"templates":7}').templates).toEqual(defaults);
  });

  it("falls back per field", () => {
    const parsed = parseSettings('{"templates":{"folder":" /x ","dateFormat":"DD-MM-YYYY","quickTarget":"nope","inboxFile":"","lastUsed":4}}').templates;
    expect(parsed).toEqual({ ...defaults, folder: "/x", dateFormat: "DD-MM-YYYY" });
  });
});


it("round trips the large-folder setting and defaults invalid values", () => {
  expect(parseSettings(JSON.stringify({ performance: { largeFolders: "off" } })).performance.largeFolders).toBe("off");
  expect(parseSettings(JSON.stringify({ performance: { largeFolders: "bad" } })).performance.largeFolders).toBe("auto");
});

it("validates and round trips focus and typewriter settings", () => {
  expect(parseSettings('{"focus":{"width":"invalid"},"editor":{"typewriterScrolling":"yes"}}').focus.width).toBe("standard");
  expect(parseSettings('{"editor":{"typewriterScrolling":"yes"}}').editor.typewriterScrolling).toBe(false);
  const settings = parseSettings('{"focus":{"width":"wide"},"editor":{"typewriterScrolling":true}}');
  expect(parseSettings(JSON.stringify(settings)).focus.width).toBe("wide"); expect(parseSettings(JSON.stringify(settings)).editor.typewriterScrolling).toBe(true);
});

it("defaults hover previews on and preserves explicit false", () => {
  expect(parseSettings("{}").links.hoverPreview).toBe(true);
  expect(parseSettings('{"links":{"hoverPreview":"no"}}').links.hoverPreview).toBe(true);
  const off = parseSettings('{"links":{"hoverPreview":false}}'); expect(parseSettings(JSON.stringify(off)).links.hoverPreview).toBe(false);
});
