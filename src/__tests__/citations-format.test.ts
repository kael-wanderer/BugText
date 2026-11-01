import { describe, expect, it } from "vitest";
import { inText, parseSource, referenceLine, sortForStyle } from "../citations/format";
import type { Entry } from "../citations/csl-json";
const entry: Entry = { key: "smith", type: "book", authors: ["Smith", "Lee"], authorsFull: ["Smith, Jane", "Lee, Sam"], year: "2024", title: "Title", container: "Press" };
describe("citation formatting", () => {
  it("formats styles, locators and bare citations", () => {
    const items = [{ ...parseSource("[see @smith, p. 12]")[0], entry }];
    expect(inText(items, "chicago", false, () => 1)).toBe("(see Smith and Lee 2024, 12)");
    expect(inText(items, "apa", false, () => 1)).toBe("(see Smith & Lee, 2024, p. 12)");
    expect(inText(items, "ieee", false, () => 1)).toBe("[see 1, p. 12]");
    expect(inText([{ ...items[0], prefix: "" }], "chicago", true, () => 1)).toBe("Smith and Lee (2024, 12)");
  });
  it("handles missing keys, suppressed authors and references", () => {
    expect(inText(parseSource("[@missing]"), "apa", false, () => 1)).toBe("(?missing)");
    expect(inText([{ ...parseSource("[-@smith]")[0], entry }], "chicago", false, () => 1)).toBe("(2024)");
    expect(referenceLine(entry, "apa")).toContain("(2024)");
    expect(sortForStyle(["smith"], new Map([["smith", entry]]), "ieee")).toEqual(["smith"]);
  });
});

it("requires a citation boundary and formats APA author lists", () => {
  expect(parseSource("[ask a@b.com]")).toEqual([]);
  expect(parseSource("[see @valid; -@other]").map(x => x.key)).toEqual(["valid", "other"]);
  expect(referenceLine({ ...entry, authorsFull: ["Smith, A.", "Lee, B.", "Ong, C."] }, "apa")).toContain("Smith, A., Lee, B., & Ong, C.");
  expect(referenceLine({ ...entry, authorsFull: ["Smith, A.", "Lee, B."] }, "apa")).toContain("Smith, A., & Lee, B.");
});
