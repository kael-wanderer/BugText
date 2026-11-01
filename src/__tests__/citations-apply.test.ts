// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { renderMarkdown } from "../preview";
import { applyCitations } from "../citations/apply";
import type { Entry } from "../citations/csl-json";
it("formats safely, adds references and supports jumping", () => {
  const entry: Entry = { key: "x", type: "book", authors: ["Lee"], authorsFull: ["Lee"], year: "2023", title: '<img src=x onerror=alert(1)>', container: "" };
  const host = document.createElement("div"); host.innerHTML = renderMarkdown("[@x; @missing] @unknown");
  const onJump = vi.fn();
  expect(applyCitations(host, { status: "ok", library: { path: "references.json", entries: new Map([["x", entry]]) } }, "apa", { references: true, onJump })).toEqual({ cited: ["x"], missing: ["missing"] });
  expect(host.querySelector("img")).toBeNull();
  expect(host.querySelector("li")?.textContent).toContain(entry.title);
  expect(host.textContent).toContain("@unknown");
  host.querySelector<HTMLElement>(".bugtext-cite")!.click(); expect(onJump).toHaveBeenCalledWith("x");
});
it("unwraps citations when no bibliography is available", () => {
  const host = document.createElement("div"); host.innerHTML = renderMarkdown("[@x]");
  applyCitations(host, { status: "none" }, "chicago", { references: false });
  expect(host.textContent).toBe("[@x]\n"); expect(host.querySelector(".bugtext-cite")).toBeNull();
});
it("does not count an unknown bare mention as missing", () => {
  const host = document.createElement("div"); host.innerHTML = renderMarkdown("@someone and [@missing]");
  const result = applyCitations(host, { status: "ok", library: { path: "/x", entries: new Map() } }, "chicago", { references: false });
  expect(result).toEqual({ cited: [], missing: ["missing"] });
});
