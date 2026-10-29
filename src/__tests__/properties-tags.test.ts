import { expect, it } from "vitest";
import { bodyTags, frontMatterTags, tagAncestors, tagKey } from "../properties/tags";

it("extracts tags outside frontmatter, headings and code", () => {
  expect(bodyTags("---\ntags: #hidden\n---\n# Heading\n#tag #1 #2024 #a/b/\n`#inline`\n```\n#code\n```" )).toEqual(["tag", "a/b"]);
  expect(frontMatterTags({ tags: "#One, two" })).toEqual(["One", "two"]);
  expect(frontMatterTags({ tags: ["#One", "two"] })).toEqual(["One", "two"]);
  expect(tagAncestors("a/b/c")).toEqual(["a", "a/b", "a/b/c"]);
  expect(tagKey("One")).toBe("one");
});
