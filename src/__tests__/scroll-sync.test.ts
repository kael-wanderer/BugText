import { describe, expect, it } from "vitest";
import { createScrollGuard, lineToOffset, offsetToLine } from "../scroll-sync";

describe("scroll mapping", () => {
  const anchors = [{ line: 10, offset: 100 }, { line: 20, offset: 300 }];
  it("interpolates and clamps", () => {
    expect([lineToOffset(1, anchors), lineToOffset(15, anchors), lineToOffset(30, anchors), lineToOffset(1, [])]).toEqual([100, 200, 300, 0]);
    expect([offsetToLine(1, anchors), offsetToLine(200, anchors), offsetToLine(400, anchors), offsetToLine(1, [])]).toEqual([10, 15, 20, 0]);
  });
  it("ignores sync events and waits for the driver to become quiet", () => {
    let time = 0;
    const guard = createScrollGuard(() => time);
    expect(guard.drive("editor")).toBe(true);
    guard.ignore("preview");
    expect(guard.drive("preview")).toBe(false);
    time = 100;
    expect(guard.drive("preview")).toBe(false);
    time = 151;
    expect(guard.drive("preview")).toBe(true);
  });
});
