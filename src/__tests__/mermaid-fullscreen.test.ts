// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { openMermaidFullscreen } from "../mermaid-fullscreen";
import { STEP } from "../mermaid-zoom";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 800, height: 600, x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, toJSON: () => ({}) });
  // jsdom does not implement pointer capture.
  vi.stubGlobal("PointerEvent", MouseEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(): { svg: SVGSVGElement; host: HTMLElement } {
  const host = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 400 200");
  svg.style.width = "125%";
  document.body.append(svg, host);
  return { svg, host };
}
function wheel(overlay: HTMLElement): WheelEvent {
  const event = new WheelEvent("wheel", { deltaY: -100, clientX: 0, clientY: 0, cancelable: true, bubbles: true });
  overlay.dispatchEvent(event);
  return event;
}
it("shows a copy of the diagram in a dialog inside the window", () => {
  const { svg, host } = setup();
  openMermaidFullscreen(svg, host);
  const overlay = host.querySelector<HTMLElement>(".mermaid-fullscreen")!;
  expect(overlay.getAttribute("role")).toBe("dialog");
  expect(overlay.getAttribute("aria-modal")).toBe("true");
  expect(overlay.getAttribute("aria-label")).toBe("Diagram");
  expect(overlay.querySelector("svg")).not.toBe(svg);
  expect(svg.isConnected).toBe(true);
  const clone = overlay.querySelector("svg")!;
  expect(clone.getAttribute("width")).toBe("400");
  expect(clone.getAttribute("height")).toBe("200");
  expect(clone.style.width).toBe("");
  expect(document.activeElement).toBe(overlay);
});
it("closes on Escape and on the Close button, and gives focus back", () => {
  const { svg, host } = setup();
  const button = document.createElement("button");
  host.append(button);
  button.focus();
  const outer = vi.fn();
  host.addEventListener("keydown", outer);
  openMermaidFullscreen(svg, host);
  host.querySelector(".mermaid-fullscreen")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(host.querySelector(".mermaid-fullscreen")).toBeNull();
  expect(document.activeElement).toBe(button);
  expect(outer).not.toHaveBeenCalled();
  openMermaidFullscreen(svg, host);
  host.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
  expect(host.querySelector(".mermaid-fullscreen")).toBeNull();
  expect(document.activeElement).toBe(button);
});
it("zooms on wheel and pans on drag", () => {
  const { svg, host } = setup();
  const dialog = openMermaidFullscreen(svg, host);
  const overlay = host.querySelector<HTMLElement>(".mermaid-fullscreen")!;
  const stage = overlay.querySelector<HTMLElement>(".mermaid-stage")!;
  expect(stage.style.transform).toBe("translate(200px, 200px) scale(1)");
  expect(wheel(overlay).defaultPrevented).toBe(true);
  expect(stage.style.transform).toBe(`translate(250px, 250px) scale(${STEP})`);
  overlay.dispatchEvent(new PointerEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true, button: 0 }));
  overlay.dispatchEvent(new PointerEvent("pointermove", { clientX: 40, clientY: 30, bubbles: true }));
  overlay.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  expect(stage.style.transform).toBe(`translate(280px, 270px) scale(${STEP})`);
  overlay.querySelector<HTMLButtonElement>('[aria-label="Fit"]')!.click();
  expect(stage.style.transform).toBe("translate(200px, 200px) scale(1)");
  dialog.close();
  const before = stage.style.transform;
  wheel(overlay);
  expect(stage.style.transform).toBe(before);
});
it("survives the source diagram being removed", () => {
  const { svg, host } = setup();
  openMermaidFullscreen(svg, host);
  const overlay = host.querySelector<HTMLElement>(".mermaid-fullscreen")!;
  svg.remove();
  expect(() => wheel(overlay)).not.toThrow();
  expect(overlay.isConnected).toBe(true);
  expect(overlay.querySelector(".mermaid-stage")!.getAttribute("style")).toContain(`scale(${STEP})`);
});
it("opens only one overlay per window", () => {
  const { svg, host } = setup();
  const previous = openMermaidFullscreen(svg, host);
  openMermaidFullscreen(svg, host);
  expect(host.querySelectorAll(".mermaid-fullscreen")).toHaveLength(1);
  previous.close();
  expect(host.querySelectorAll(".mermaid-fullscreen")).toHaveLength(1);
});
