// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const initialize = vi.fn();
const render = vi.fn();
vi.mock("mermaid", () => ({ default: { initialize, render } }));

import { enhancePreview, mermaidResult } from "../render-extras";

function block(code: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `<pre><code class="language-mermaid"></code></pre>`;
  root.querySelector("code")!.textContent = code;
  document.body.appendChild(root);
  return root;
}

describe("enhancePreview mermaid config", () => {
  it("initializes strict, plain-label, dagre classic", async () => {
    render.mockResolvedValue({ svg: "<svg></svg>" });
    await enhancePreview(block("graph TD; A-->B"));
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: "strict",
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        layout: "dagre",
        look: "classic",
      }),
    );
  });

  it("shows an error instead of throwing on a bad diagram", async () => {
    render.mockRejectedValue(new Error("Parse error"));
    const root = block("nonsense");
    await enhancePreview(root);
    const host = root.querySelector(".mermaid-error");
    expect(host?.textContent).toContain("Mermaid error");
  });
});

it("remembers each diagram's source, line and error", async () => {
  render.mockResolvedValue({ svg: "<svg></svg>" });
  const root = block("graph TD; A-->B");
  root.querySelector("pre")!.setAttribute("data-line", "7");
  await enhancePreview(root);
  const host = root.querySelector<HTMLElement>(".mermaid-rendered")!;
  expect(host.getAttribute("data-line")).toBe("7");
  expect(mermaidResult(host)).toEqual({ code: "graph TD; A-->B", error: null, line: 7 });
});
it("records the error text of a failed diagram", async () => {
  render.mockRejectedValue(new Error("Parse error on line 2"));
  const root = block("nonsense");
  await enhancePreview(root);
  const result = mermaidResult(root.querySelector<HTMLElement>(".mermaid-error")!)!;
  expect(result.error).toContain("Parse error on line 2");
  expect(result.line).toBeNull();
});
