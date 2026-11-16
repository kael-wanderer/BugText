import { describe, expect, it } from "vitest";
import { validateGuide } from "../guide/guideValidator";

/**
 * The user guide (published at kael.io.vn/projects/bugtext/docs) is content in
 * this repository, so a broken guide — or an already published slug going
 * missing, or a page the app links to — fails the suite like any other defect.
 */
describe("docs/guide", () => {
  it("has no problems", async () => {
    // Vitest runs from the repository root, as the other file-reading tests assume.
    const { LINKED_GUIDE_SLUGS } = await import("../guide/guideLinks");
    expect(validateGuide("docs/guide", LINKED_GUIDE_SLUGS)).toEqual([]);
  });
});

describe("guide link", () => {
  it("points at the published guide", async () => {
    const { GUIDE_BASE_URL } = await import("../guide/guideLinks");
    expect(GUIDE_BASE_URL).toBe("https://kael.io.vn/projects/bugtext/docs");
  });

  it("sends each Settings page to the guide page that explains it", async () => {
    const { guideUrl, settingsGuideSlug } = await import("../guide/guideLinks");
    expect(guideUrl()).toBe("https://kael.io.vn/projects/bugtext/docs");
    expect(guideUrl(settingsGuideSlug("export"))).toBe("https://kael.io.vn/projects/bugtext/docs/writing/export");
    expect(settingsGuideSlug("ai")).toBe("ai/set-up-ai");
    expect(settingsGuideSlug("ai", "mcp")).toBe("ai/mcp-server");
    expect(settingsGuideSlug("ai", "local-cli")).toBe("ai/set-up-ai");
  });
});
