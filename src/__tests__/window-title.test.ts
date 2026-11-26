import { describe, expect, it } from "vitest";
import { windowTitle } from "../window-title";

const base = { fileName: null, dirty: false, folderName: null, workspaceName: null };

describe("windowTitle", () => {
  it("is BugText when nothing is open", () => {
    expect(windowTitle(base)).toBe("BugText");
  });
  it("shows the folder when no file is open", () => {
    expect(windowTitle({ ...base, folderName: "bugtext" })).toBe("bugtext");
  });
  it("shows file — folder", () => {
    expect(windowTitle({ ...base, fileName: "roadmap.md", folderName: "bugtext" })).toBe("roadmap.md — bugtext");
  });
  it("prefers the workspace name over the folder", () => {
    expect(windowTitle({ ...base, fileName: "roadmap.md", folderName: "bugtext", workspaceName: "BugText work" }))
      .toBe("roadmap.md — BugText work");
  });
  it("marks unsaved changes", () => {
    expect(windowTitle({ ...base, fileName: "roadmap.md", dirty: true, folderName: "bugtext" })).toBe("● roadmap.md — bugtext");
  });
  it("shows only the file when there is no folder", () => {
    expect(windowTitle({ ...base, fileName: "notes.md" })).toBe("notes.md");
  });
});
