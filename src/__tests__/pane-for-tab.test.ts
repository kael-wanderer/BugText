import { expect, it } from "vitest";
import { paneForTab } from "../mcp/pane-for-tab";

it("finds the pane that owns a tab id", () => {
  expect(paneForTab([
    { id: "main", tabs: [{ id: "main-tab" }] },
    { id: "sub", tabs: [{ id: "sub-tab" }] },
  ], "sub-tab")).toBe("sub");
});

it("returns null when no pane contains the tab id", () => {
  expect(paneForTab([{ id: "main", tabs: [{ id: "other" }] }], "missing")).toBeNull();
});
