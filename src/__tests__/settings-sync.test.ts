import { describe, expect, it } from "vitest";
import { shouldReload } from "../settings-sync";

describe("shouldReload", () => {
  it("ignores own window", () => {
    expect(shouldReload({ file: "settings", from: "main" }, "main")).toBeNull();
  });
  it("returns the file for other windows", () => {
    expect(shouldReload({ file: "agent", from: "window-2" }, "main")).toBe("agent");
  });
  it("rejects malformed payloads", () => {
    for (const p of [null, "x", {}, { file: "other", from: "w" }, { file: "settings" }]) {
      expect(shouldReload(p, "main")).toBeNull();
    }
  });
});
