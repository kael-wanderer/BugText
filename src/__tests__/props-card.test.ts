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
    host.querySelector("button")!.click(); expect(host.hidden).toBe(true); expect(showSource).toHaveBeenCalledOnce();
  });
  it("shows errors and hides without frontmatter", () => {
    const host = document.createElement("div"); let source = "---\nx: [\n---\n";
    const card = createPropertiesCard(host, () => source, vi.fn()); card.render();
    expect(host.textContent).toContain("Properties could not be read — line 3:");
    expect(host.querySelectorAll(".properties-row")).toHaveLength(0);
    source = "plain"; card.render(); expect(host.hidden).toBe(true);
  });
});
