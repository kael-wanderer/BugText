// @vitest-environment jsdom
import { expect, it } from "vitest";
import { targetLabel } from "../links/panel";

it("shows note links as folder-relative paths without percent escapes", () => {
  expect(targetLabel("Meeting%20Notes.md", { kind: "note", path: "/n/Meeting Notes.md" }, "/n")).toBe("Meeting Notes.md");
  expect(targetLabel("a/b.md#Top%20Part", { kind: "note", path: "/n/a/b.md", anchor: "Top Part" }, "/n/")).toBe("a/b.md#Top Part");
});
it("decodes other targets and keeps malformed escapes as written", () => {
  expect(targetLabel("https://x.io/a%20b", { kind: "web", path: "https://x.io/a%20b" }, "/n")).toBe("https://x.io/a b");
  expect(targetLabel("bad%E0.md", { kind: "invalid" }, "/n")).toBe("bad%E0.md");
});
