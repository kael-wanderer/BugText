import { expect, it } from "vitest";
import { noteLinks } from "../links/parse";
import { editedText } from "../links/rename-plan";
import { resolveLink } from "../links/resolve";
import { mentionEdit, mentionPattern, mentionTitle, mentionsInNote } from "../links/mentions";
it("matches whole phrases while excluding code, frontmatter, links, URLs and comments", () => {
  const source = '---\ntitle: Release checklist\n---\n```\nRelease checklist\n```\n\n    Release checklist\n\n`Release checklist` [Release checklist](Release%20checklist.md) <https://a/Release checklist> https://a/Release-checklist <!-- Release checklist -->\nRelease checklists\nrelease CHECKLIST';
  const found = mentionsInNote({ path: "/r/a.md", source, links: noteLinks(source) }, mentionPattern("Release checklist"));
  expect(found.map(m => m.text)).toEqual(["release CHECKLIST"]);
  expect(mentionsInNote({ path: "/r/a.md", source: "Cafés Café", links: [] }, mentionPattern("Café")).map(m => m.text)).toEqual(["Café"]);
  expect(mentionTitle("/r/ab.md")).toBeNull();
  expect(mentionsInNote({ path: "/r/a.md", source: "a+b (draft)", links: [] }, mentionPattern("a+b (draft)"))).toHaveLength(1);
});
it("inserts one relative link and preserves the surrounding source", () => {
  const source = "before release CHECKLIST after", active = "/r/Release checklist.md";
  const mention = mentionsInNote({ path: "/r/sub/a.md", source, links: [] }, mentionPattern("Release checklist"))[0];
  const plan = mentionEdit(mention, active), text = editedText(source, plan.edits);
  expect(text).toBe("before [release CHECKLIST](<../Release checklist.md>) after");
  expect(resolveLink(noteLinks(text)[0].target, plan.path, "/r").path).toBe(active);
});

it("keeps source offsets correct after comments before code", () => {
  const source = "<!-- a long comment -->\n```\nTarget name\n```\nTarget name";
  const found = mentionsInNote({ path: "/r/a.md", source, links: noteLinks(source) }, mentionPattern("Target name"));
  expect(found).toHaveLength(1); expect(found[0].line).toBe(5); expect(source.slice(found[0].from, found[0].to)).toBe("Target name");
});
