import { describe, expect, it } from "vitest";
import { parseBibtex } from "../citations/bibtex";
import { parseCslJson } from "../citations/csl-json";

describe("bibliography parsers", () => {
  it("parses equivalent 200-entry bibliographies", () => {
    const bib = Array.from({ length: 200 }, (_, i) => `@article{k${i}, author={Jane Smith}, title={Title ${i}}, year={2024}}`).join("\n");
    const json = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: `k${i}`, type: "article", author: [{ family: "Smith", given: "Jane" }], title: `Title ${i}`, issued: { "date-parts": [[2024]] } })));
    expect(parseBibtex(bib)).toEqual(parseCslJson(json));
  });
  it("handles macros, concatenation, accents, corporate authors and editor fallback", () => {
    const entries = parseBibtex(String.raw`@string{place = "Journal"}
@article{x, author={{Example Corp} and Doe, Jane}, title={Caf\'e} # " study", journal=place, date={2023-01-01}}
@book{y, editor={Lee, Sam}, title={A {nested} title}}`);
    expect(entries[0]).toMatchObject({ authors: ["Example Corp", "Doe"], authorsFull: ["Example Corp", "Doe, Jane"], title: "Café study", container: "Journal", year: "2023" });
    expect(entries[1].authors).toEqual(["Lee"]);
  });
  it("rejects garbage and retains the first duplicate", () => {
    expect(() => parseBibtex("nonsense")).toThrow();
    expect(() => parseCslJson("{}")).toThrow();
    expect(parseBibtex('@book{x,title={First}} @book{x,title={Second}}')).toHaveLength(1);
  });
});

it("removes formatting commands but retains their content", () => {
  expect(parseBibtex(String.raw`@book{x,title={A \emph{Study} \textit{x} \LaTeX{}}}`)[0].title).toBe("A Study x LaTeX");
});
