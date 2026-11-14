import { expect, it } from "vitest";

// The project has no Node type definitions; give fs the one call used here.
const { readFileSync } = (await import("node:fs" as string)) as {
  readFileSync: (path: string, encoding: "utf8") => string;
};
const css = readFileSync("src/styles.css", "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

it("draws the changed-block margin mark the full height of the block", () => {
  const shadow = /box-shadow:\s*([^;]+);/.exec(rule(".pane-preview .review-changed"))?.[1] ?? "";
  const [x, y, blur, spread] = shadow.trim().split(/\s+/).map(v => parseFloat(v));
  // A negative spread shrinks the shadow on every side, so a one-line block got a mark
  // only a few pixels tall. The mark is the left edge of an unshrunk shadow.
  expect(spread).toBe(0);
  expect(y).toBe(0);
  expect(blur).toBe(0);
  expect(x).toBeLessThan(0);
});
