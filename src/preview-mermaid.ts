import type { MermaidResult } from "./render-extras";
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
