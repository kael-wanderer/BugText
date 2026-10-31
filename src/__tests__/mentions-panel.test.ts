// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createLinksPanel } from "../links/panel";
import type { LinkIndex } from "../links/index";
import type { createMentionsSection } from "../links/mentions-section";
it("mounts mentions after outgoing links and cancels on hide or a non-note", async () => {
  const host = document.createElement("div"), mentions = { mount: vi.fn(), cancel: vi.fn() };
  const index = { folder: "/r", ready: true, backlinks: () => [], outgoing: () => [], skipped: [], capped: false, ensure: async () => {} } as unknown as LinkIndex;
  let current: { path: string; text: string } | null = { path: "/r/a.md", text: "" };
  const panel = createLinksPanel(host, index, () => current, vi.fn(), vi.fn(), undefined, undefined, mentions as ReturnType<typeof createMentionsSection>);
  await panel.show(true); expect(mentions.mount).toHaveBeenCalledWith(host, current);
  current = null; panel.render(); expect(mentions.cancel).toHaveBeenCalled();
  const calls = mentions.cancel.mock.calls.length; await panel.show(false); expect(mentions.cancel.mock.calls.length).toBeGreaterThan(calls);
});
