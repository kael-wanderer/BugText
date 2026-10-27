import { describe, expect, it } from "vitest";
import {
  altFromName,
  folderLabel,
  imageMarkdown,
  isImagePath,
  isRelativeImageSrc,
  localImageLinks,
  pastedImageStem,
  validImageFolder,
} from "../image-insert";

describe("image-insert", () => {
  it("detects image files by extension", () => {
    expect(isImagePath("/a/Shot.PNG")).toBe(true);
    expect(isImagePath("/a/b.webp")).toBe(true);
    expect(isImagePath("/a/b.md")).toBe(false);
    expect(isImagePath("/a/.png")).toBe(false);
    expect(isImagePath("/a.png/readme")).toBe(false);
  });

  it("validates the image folder", () => {
    for (const ok of [".", "assets", "img/screens"]) expect(validImageFolder(ok)).toBe(true);
    for (const bad of ["", "..", "../x", "/abs", "a/b/c", "a//b", "./a", "a\\b", "x".repeat(65)]) {
      expect(validImageFolder(bad)).toBe(false);
    }
  });

  it("builds Markdown with encoded links and escaped alt text", () => {
    expect(imageMarkdown("", "assets/a.png")).toBe("![](assets/a.png)");
    expect(imageMarkdown("Shot 1", "assets/Shot 1 (2).png")).toBe("![Shot 1](assets/Shot%201%20%282%29.png)");
    expect(imageMarkdown("a]b", "x.png")).toBe("![a\\]b](x.png)");
    expect(altFromName("Shot 1.png")).toBe("Shot 1");
  });

  it("names pasted images after the note and time", () => {
    const date = new Date(2026, 9, 27, 19, 30, 12);
    expect(pastedImageStem("/n/Trip notes.md", "note", date)).toBe("Trip notes-20261027-193012");
    expect(pastedImageStem("/n/Trip notes.md", "image", date)).toBe("image-20261027-193012");
    expect(folderLabel("assets")).toBe("assets/");
    expect(folderLabel(".")).toBe("the note's folder");
  });

  it("tells relative sources from URLs", () => {
    expect(isRelativeImageSrc("assets/a.png")).toBe(true);
    expect(isRelativeImageSrc("../a.png")).toBe(true);
    for (const no of ["https://x/a.png", "data:image/png;base64,", "/abs/a.png", "//cdn/a.png", "preview://x", ""]) {
      expect(isRelativeImageSrc(no)).toBe(false);
    }
  });

  it("lists local image links for Save As", () => {
    const md = [
      "![a](assets/a.png) ![b](<assets/b c.png>) ![c](assets/c%20d.jpg \"t\")",
      "![r](https://x/r.png) ![u](../up.png) ![d](./assets/a.png) ![n](notes.md)",
      '<img src="img/e.svg" alt="">',
    ].join("\n");
    expect(localImageLinks(md)).toEqual(["assets/a.png", "assets/b c.png", "assets/c d.jpg", "img/e.svg"]);
  });
});
