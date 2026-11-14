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
        suppressErrorRendering: true,
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

it("removes only this render's temporary elements after repeated failures", async () => {
  const root = block("nonsense");
  const unrelated = document.createElement("div");
  unrelated.id = "other-render";
  document.body.append(unrelated);
  const initialChildren = document.body.childElementCount;
  const ids: string[] = [];
  render.mockImplementation(async (id: string) => {
    ids.push(id);
    const wrapper = document.createElement("div");
    wrapper.id = `d${id}`;
    const graphic = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    graphic.id = id;
    document.body.append(wrapper, graphic);
    throw new Error("Parse error");
  });

  for (let pass = 0; pass < 2; pass++) {
    if (pass) {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.className = "language-mermaid";
      code.textContent = "nonsense again";
      pre.append(code);
      root.replaceChildren(pre);
    }
    await enhancePreview(root);
    expect(root.querySelector(".mermaid-error")?.textContent).toContain("Parse error");
    for (const id of ids) {
      expect(document.getElementById(id)).toBeNull();
      expect(document.getElementById(`d${id}`)).toBeNull();
    }
    expect(document.body.childElementCount).toBe(initialChildren);
    expect(unrelated.isConnected).toBe(true);
  }
});

it("keeps the successful SVG inside the preview host while cleaning its temporary wrapper", async () => {
  render.mockImplementation(async (id: string) => {
    const wrapper = document.createElement("div");
    wrapper.id = `d${id}`;
    document.body.append(wrapper);
    return { svg: `<svg id="${id}" xmlns="http://www.w3.org/2000/svg"><text>Diagram</text></svg>` };
  });
  const root = block("graph TD; A-->B");
  await enhancePreview(root);
  const host = root.querySelector(".mermaid-rendered")!;
  const svg = host.querySelector("svg")!;
  expect(svg?.isConnected).toBe(true);
  expect(svg.textContent).toBe("Diagram");
  expect(document.getElementById(svg.id)).toBe(svg);
  expect(document.getElementById(`d${svg.id}`)).toBeNull();
  expect(host.classList.contains("mermaid-error")).toBe(false);
});
