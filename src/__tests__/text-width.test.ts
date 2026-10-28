import { describe, expect, it } from "vitest";
import { displayWidth } from "../text-width";

describe("displayWidth", () => {
  it("counts ASCII and Latin as one column each", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("café")).toBe(4);
  });

  it("counts wide CJK and emoji as two columns", () => {
    expect(displayWidth("日本")).toBe(4);
    expect(displayWidth("한")).toBe(2);
    expect(displayWidth("🙂")).toBe(2);
  });

  it("gives combining marks, variation selectors, skin tones and ZWJ parts no width", () => {
    expect(displayWidth("é")).toBe(1);
    expect(displayWidth("Tiếng Việt")).toBe(10);
    expect(displayWidth("👍🏽")).toBe(2);
    expect(displayWidth("👩‍💻")).toBe(2);
  });
});
