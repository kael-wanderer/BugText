import { describe, expect, it } from "vitest";
import { shouldLeaveOnEscape } from "../settings-screen/registry";

describe("settings screen keys", () => {
  it("shouldLeaveOnEscape", () => {
    expect(shouldLeaveOnEscape({ tagName: "INPUT" }, false)).toBe(false);
    expect(shouldLeaveOnEscape({ tagName: "DIV", isContentEditable: true }, false)).toBe(false);
    expect(shouldLeaveOnEscape({ tagName: "BODY" }, true)).toBe(false);
    expect(shouldLeaveOnEscape({ tagName: "BODY" }, false)).toBe(true);
    expect(shouldLeaveOnEscape(null, false)).toBe(true);
  });

  it("blocks Escape only for text entry", () => {
    expect(shouldLeaveOnEscape({ tagName: "TEXTAREA" }, false)).toBe(false);
    expect(shouldLeaveOnEscape({ tagName: "SELECT" }, false)).toBe(true);
    expect(shouldLeaveOnEscape({ tagName: "INPUT", type: "checkbox" }, false)).toBe(true);
    expect(shouldLeaveOnEscape({ tagName: "INPUT", type: "search" }, false)).toBe(false);
    expect(shouldLeaveOnEscape({ tagName: "INPUT" }, false)).toBe(false);
    expect(shouldLeaveOnEscape({ tagName: "BUTTON" }, false)).toBe(true);
  });
});
