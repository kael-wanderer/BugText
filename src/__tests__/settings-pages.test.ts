import { describe, expect, it } from "vitest";
import { defaultZoneSize, stepWrapColumn, stepZoneSize } from "../settings-screen/page-editing";

describe("editing page helpers", () => {
  it("zone size stepper clamps 10..28 and resets per zone", () => {
    expect(stepZoneSize(28, +1)).toBe(28);
    expect(stepZoneSize(10, -1)).toBe(10);
    expect(stepZoneSize(15, +1)).toBe(16);
    expect(defaultZoneSize("explorer")).toBe(13);
    expect(defaultZoneSize("main")).toBe(15);
    expect(defaultZoneSize("sub")).toBe(15);
  });
  it("wrap column stepper clamps 20..200", () => {
    expect(stepWrapColumn(200, +1)).toBe(200);
    expect(stepWrapColumn(20, -1)).toBe(20);
    expect(stepWrapColumn(80, +1)).toBe(81);
  });
});
