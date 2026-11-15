import { describe, expect, it } from "vitest";
import { validateGuide } from "../guide/guideValidator";

/**
 * The user guide (published at kael.io.vn/projects/bugtext/docs) is content in
 * this repository, so a broken guide — or an already published slug going
 * missing — fails the suite like any other defect. The app links to no guide
 * page yet; when it does, pass those slugs instead of [].
 */
describe("docs/guide", () => {
  it("has no problems", () => {
    // Vitest runs from the repository root, as the other file-reading tests assume.
    expect(validateGuide("docs/guide", [])).toEqual([]);
  });
});
