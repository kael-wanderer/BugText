// @vitest-environment jsdom
import { it, expect } from "vitest";
import { renderMarkdown } from "../preview";
import { plainCallouts } from "../export-render";
it("turns callouts into quotes with a bold label", () => {
  const host = document.createElement("div");
  host.innerHTML = renderMarkdown("> [!CAUTION] Mind the gap\n> Body");
  plainCallouts(host);
  const quote = host.querySelector("blockquote")!;
  expect(quote.className).toBe("");
  expect(quote.querySelector("p")!.innerHTML).toBe("<strong>Mind the gap</strong>");
  expect(quote.querySelector(".callout-title")).toBeNull();
});