import { mermaidResult, type MermaidResult } from "./render-extras";
import { svgToPngBlob } from "./capture";
import { flashCopied } from "./copy-feedback";
import { clampScale, STEP } from "./mermaid-zoom";

export type MermaidDeps = {
  copyText: (text: string) => Promise<void>;
  copyImage: (png: Blob) => Promise<void>;
  notify: (text: string) => void;
  fullscreen?: (svg: SVGSVGElement) => void;
  fix?: { available: () => boolean; run: (r: MermaidResult & { line: number }) => void };
};

export function enhanceMermaid(root: ParentNode, deps: MermaidDeps): void {
  for (const host of root.querySelectorAll<HTMLElement>(".mermaid-error:not(.mermaid-error-card)")) {
    const result = mermaidResult(host);
    if (!result) continue;
    host.replaceChildren();
    host.classList.add("mermaid-error-card");
    const message = document.createElement("p");
    message.className = "mermaid-error-message";
    message.textContent = (result.error ?? "").split(/\r?\n/)[0].replace(/^Error: /, "");
    const source = document.createElement("pre");
    source.className = "mermaid-error-source";
    source.textContent = result.code;
    source.hidden = true;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Show source";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      source.hidden = !source.hidden;
      toggle.setAttribute("aria-expanded", String(!source.hidden));
      toggle.textContent = source.hidden ? "Show source" : "Hide source";
    });
    host.append(message, toggle, source);
    if (deps.fix?.available() && result.line !== null && result.code.trim()) {
      const line = result.line;
      const fix = document.createElement("button");
      fix.type = "button";
      fix.textContent = "Fix with AI";
      fix.addEventListener("click", () => deps.fix!.run({ ...result, line }));
      source.before(fix);
    }
  }
  for (const host of root.querySelectorAll<HTMLElement>(".mermaid-rendered")) {
    const svg = host.querySelector("svg");
    if (!svg || host.classList.contains("mermaid-error") || host.querySelector(".mermaid-toolbar")) continue;
    const toolbar = document.createElement("div");
    toolbar.className = "mermaid-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Diagram");
    const add = (label: string, text: string, run: (button: HTMLButtonElement) => void): void => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.addEventListener("click", () => run(button));
      toolbar.append(button);
    };
    let factor = 1;
    const zoom = (next: number): void => {
      factor = clampScale(next);
      svg.style.width = factor === 1 ? "" : `${factor * 100}%`;
      svg.style.maxWidth = factor === 1 ? "" : "none";
    };
    add("Zoom out", "−", () => zoom(factor / STEP));
    add("Zoom in", "+", () => zoom(factor * STEP));
    add("Fit", "Fit", () => zoom(1));
    if (deps.fullscreen) add("Fullscreen", "⤢", () => deps.fullscreen!(svg));
    add("Copy as PNG", "PNG", async (button) => {
      try {
        const png = await svgToPngBlob(svg);
        try {
          await deps.copyImage(png);
        } catch {
          throw new Error("Could not copy the image.");
        }
        flashCopied(button, true);
      } catch (error) {
        flashCopied(button, false);
        deps.notify(error instanceof Error ? error.message : "Could not copy the image.");
      }
    });
    add("Copy as SVG", "SVG", async (button) => {
      try {
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.style.removeProperty("width");
        clone.style.removeProperty("max-width");
        await deps.copyText(new XMLSerializer().serializeToString(clone));
        flashCopied(button, true);
      } catch {
        flashCopied(button, false);
        deps.notify("Could not copy the SVG.");
      }
    });
    host.append(toolbar);
  }
}
