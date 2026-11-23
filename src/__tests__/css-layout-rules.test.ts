import { describe, expect, it } from "vitest";

// The project has no Node type definitions; give fs the one call used here.
const { readFileSync } = (await import("node:fs" as string)) as {
  readFileSync: (path: string, encoding: "utf8") => string;
};
const css = readFileSync("src/styles.css", "utf8");

/** Every declaration block whose selector list contains `selector` exactly, joined. */
function rules(selector: string): string {
  const blocks: string[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((s) => s.trim());
    if (selectors.includes(selector)) blocks.push(match[2]);
  }
  expect(blocks.length, `no rule for ${selector}`).toBeGreaterThan(0);
  return blocks.join(";");
}

describe("review queue rows (BUG-044)", () => {
  it("show their buttons without changing the row's height", () => {
    // Toggling display on hover grew the row and moved every row below it.
    expect(rules(".review-row")).toMatch(/position:\s*relative/);
    const actions = rules(".review-actions");
    expect(actions).toMatch(/position:\s*absolute/);
    expect(actions).not.toMatch(/display:\s*none/);
    expect(rules(".review-row:hover .review-actions")).not.toMatch(/display:/);
  });
});

describe("AI run card file lines (BUG-045)", () => {
  it("colour created and deleted files from the theme, not fixed dark colours", () => {
    // #2e7d32 and #c62828 measured 2.2–3.3:1 on dark themes.
    expect(rules(".ai-run-file.added")).toMatch(/color:\s*var\(--tok-string\)/);
    expect(rules(".ai-run-file.deleted")).toMatch(/color:\s*color-mix\([^;]*var\(--text\)/);
  });
});
