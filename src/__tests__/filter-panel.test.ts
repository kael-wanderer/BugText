// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createLinkIndex, parseNote } from "../links/index";
import { createFilterPanel } from "../filter/panel";
it("adds a tag chip, opens results and shows skipped notes safely", async () => {
  const notes = [parseNote("/r/a.md", "#work"), parseNote("/r/b.md", "---\nx: [\n---\n")];
  const index = createLinkIndex(async () => ({ notes, skipped: [] })); index.setFolder("/r");
  const host = document.createElement("div"); const open = vi.fn(); const panel = createFilterPanel(host, index, open); await panel.show(true);
  expect(host.textContent).toContain("Invalid YAML properties");
  host.querySelector<HTMLButtonElement>(".filter-tag")!.click();
  expect(host.querySelector(".filter-chips")!.textContent).toContain("work");
  host.querySelector<HTMLButtonElement>(".filter-results .link-panel-row")!.click(); expect(open).toHaveBeenCalledWith("/r/a.md");
});
