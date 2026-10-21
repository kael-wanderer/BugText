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

  it("stays on Escape in textarea and select", () => {
    expect(shouldLeaveOnEscape({ tagName: "TEXTAREA" }, false)).toBe(false);
    expect(shouldLeaveOnEscape({ tagName: "SELECT" }, false)).toBe(false);
    expect(shouldLeaveOnEscape({ tagName: "BUTTON" }, false)).toBe(true);
  });
});
