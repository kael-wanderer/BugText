import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { createPropertiesCard } from "../properties/card";

beforeEach(() => installTestDom());
describe("properties card", () => {
  it("renders values as text and shows source", () => {
    const host = document.createElement("div"); const showSource = vi.fn();
    const card = createPropertiesCard(host, () => '---\ntags: [one, two]\ndate: 2026-10-29\ncount: 1\nchecked: true\ntext: "<img src=x onerror=alert(1)>"\n---\n', showSource);
    card.render();
    expect(host.querySelectorAll(".properties-row")).toHaveLength(5);
    expect(host.querySelectorAll(".properties-chip")).toHaveLength(2);
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(host.querySelector("img")).toBeNull();
    host.querySelector("button")!.click(); expect(host.textContent).toContain("Show properties"); expect(showSource).toHaveBeenCalledOnce();
  });
  it("shows errors and hides without frontmatter", () => {
    const host = document.createElement("div"); let source = "---\nx: [\n---\n";
    const card = createPropertiesCard(host, () => source, vi.fn()); card.render();
    expect(host.textContent).toContain("Properties could not be read — line 3:");
    expect(host.querySelectorAll(".properties-row")).toHaveLength(0);
    source = "plain"; card.render(); expect(host.hidden).toBe(true);
  });
});

it("removes a chip through one bound edit and refuses invalid YAML", () => {
  let source = "---\ntags: [one, two]\n---\nbody";
  const host = document.createElement("div"); const apply = vi.fn((current, edit) => {
    expect(current).toBe(source); source = source.slice(0, edit.from) + edit.insert + source.slice(edit.to); return true;
  });
  const card = createPropertiesCard(host, () => source, vi.fn(), apply); card.render();
  const chip = host.querySelector(".properties-chip")!;
  chip.querySelector("button")!.click();
  expect(apply).toHaveBeenCalledOnce(); expect(source).toContain("tags: [ two ]");
  source = "---\nx: [\n---\n"; card.render();
  expect(host.querySelectorAll("input")).toHaveLength(0);
  expect(apply).toHaveBeenCalledOnce();
});
