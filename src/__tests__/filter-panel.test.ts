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
it("keeps incomplete property drafts out of results until Apply", async () => {
  const notes = [parseNote("/r/a.md", "---\nstatus: Active\n---\n"), parseNote("/r/b.md", "---\nstatus: Done\n---\n")];
  const index = createLinkIndex(async () => ({notes,skipped:[]}));index.setFolder("/r");const host=document.createElement("div");const panel=createFilterPanel(host,index,vi.fn());await panel.show(true);
  host.querySelector<HTMLButtonElement>(".filter-add-property")!.click();expect(host.querySelectorAll(".filter-results .link-panel-row")).toHaveLength(2);
  const value=host.querySelector<HTMLInputElement>('[aria-label="Value"]')!;value.value="Active";
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Apply")!.click();expect(host.querySelectorAll(".filter-results .link-panel-row")).toHaveLength(1);expect(panel.getModel().rows[0].value).toBe("Active");panel.dispose();
});
it("status quick chips set one status row at a time", async () => {
  const notes = [parseNote("/r/a.md", "---\nstatus: superseded\n---\n"), parseNote("/r/b.md", "---\nstatus: current\n---\n"), parseNote("/r/c.md", "plain")];
  const index = createLinkIndex(async () => ({ notes, skipped: [] })); index.setFolder("/r");
  const host = document.createElement("div"); const panel = createFilterPanel(host, index, vi.fn()); await panel.show(true);
  const chip = (label: string) => [...host.querySelectorAll<HTMLButtonElement>(".filter-status-chips button")].find(b => b.textContent === label)!;
  expect([...host.querySelectorAll(".filter-status-chips button")].map(b => b.textContent)).toEqual(["Draft", "Current", "Superseded"]);
  chip("Superseded").click();
  expect(panel.getModel().rows).toEqual([{ key: "status", op: "is", value: "superseded" }]);
  expect(chip("Superseded").getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelectorAll(".filter-results .link-panel-row")).toHaveLength(1);
  chip("Current").click();
  expect(panel.getModel().rows).toEqual([{ key: "status", op: "is", value: "current" }]);
  chip("Current").click();
  expect(panel.getModel().rows).toEqual([]);
  expect(chip("Current").getAttribute("aria-pressed")).toBe("false");
  panel.dispose();
});
