import { describe, expect, it } from "vitest";
import { APP_ICON_IDS } from "../settings";
import { APP_ICONS } from "../settings-screen/app-icons";
import { stepIcon } from "../settings-screen/app-icon-picker";

describe("app icon picker", () => {
  it("stepIcon wraps both ways", () => {
    expect(stepIcon("pixel-bug", 1)).toBe("bt-lettermark");
    expect(stepIcon("bt-lettermark", -1)).toBe("pixel-bug");
  });
  it("stepIcon moves one step inside the list", () => {
    expect(stepIcon("page-bug", 1)).toBe("cursor-ladybug");
    expect(stepIcon("nib-bug", -1)).toBe("b-wings");
  });
  it("APP_ICONS matches APP_ICON_IDS order", () => {
    expect(APP_ICONS.map((i) => i.id)).toEqual([...APP_ICON_IDS]);
  });
  it("APP_ICONS svgs are standalone 1024 SVGs without scripts or handlers", () => {
    for (const icon of APP_ICONS) {
      expect(icon.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"')).toBe(true);
      expect(icon.svg).not.toMatch(/<script|\son\w+=/i);
    }
  });
});
