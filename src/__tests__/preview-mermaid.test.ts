// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { mermaidResult } from "../render-extras";
import { svgToPngBlob } from "../capture";
import { enhanceMermaid, type MermaidDeps } from "../preview-mermaid";

vi.mock("../render-extras", () => ({ mermaidResult: vi.fn() }));
vi.mock("../capture", () => ({ svgToPngBlob: vi.fn() }));
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); });
afterEach(() => vi.useRealTimers());

function diagram(): { root: HTMLElement; host: HTMLElement } {
  const root = document.createElement("div");
  const host = document.createElement("div");
  host.className = "mermaid-rendered";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 400 200");
  host.append(svg);
  root.append(host);
  return { root, host };
}
function deps(overrides: Partial<MermaidDeps> = {}): MermaidDeps {
  return { copyText: vi.fn().mockResolvedValue(undefined), copyImage: vi.fn().mockResolvedValue(undefined), notify: vi.fn(), ...overrides };
}
function click(host: HTMLElement, label: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  button.click();
  return button;
}
async function settle(): Promise<void> {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
}
const LABELS = ["Zoom out", "Zoom in", "Fit", "Fullscreen", "Copy as PNG", "Copy as SVG"];

it("adds a labelled toolbar to a rendered diagram", () => {
  const { root, host } = diagram();
  const fullscreen = vi.fn();
  enhanceMermaid(root, deps({ fullscreen }));
  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>(".mermaid-toolbar button"));
  expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(LABELS);
  expect(buttons.every((b) => b.type === "button")).toBe(true);
  expect(host.querySelector(".mermaid-toolbar")!.getAttribute("role")).toBe("toolbar");
  click(host, "Fullscreen");
  expect(fullscreen).toHaveBeenCalledWith(host.querySelector("svg"));
});
it("leaves out Fullscreen when no handler is given", () => {
  const { root, host } = diagram();
  enhanceMermaid(root, deps());
  expect(host.querySelectorAll("button")).toHaveLength(5);
  expect(host.querySelector('[aria-label="Fullscreen"]')).toBeNull();
});
it("zooms in steps and Fit returns to the fitted size", () => {
  const { root, host } = diagram();
  enhanceMermaid(root, deps());
  click(host, "Zoom in"); click(host, "Zoom in");
  const svg = host.querySelector("svg")!;
  expect(svg.style.width).toBe("156.25%");
  expect(svg.style.maxWidth).toBe("none");
  click(host, "Zoom out");
  expect(svg.style.width).toBe("125%");
  click(host, "Fit");
  expect(svg.style.width).toBe("");
  expect(svg.style.maxWidth).toBe("");
});
it("copies the SVG markup as text", async () => {
  const { root, host } = diagram();
  const d = deps();
  enhanceMermaid(root, d);
  click(host, "Zoom in");
  const button = click(host, "Copy as SVG");
  await settle();
  const markup = vi.mocked(d.copyText).mock.calls[0][0];
  expect(markup.startsWith("<svg")).toBe(true);
  expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(markup).not.toContain("125%");
  expect(button.textContent).toBe("Copied");
  expect(host.querySelector("svg")!.style.width).toBe("125%");
});
it("copies a PNG and reports a failure", async () => {
  const { root, host } = diagram();
  const d = deps();
  const png = new Blob(["png"], { type: "image/png" });
  vi.mocked(svgToPngBlob).mockResolvedValue(png);
  enhanceMermaid(root, d);
  const button = click(host, "Copy as PNG");
  await settle();
  expect(d.copyImage).toHaveBeenCalledWith(png);
  expect(button.textContent).toBe("Copied");
  vi.mocked(svgToPngBlob).mockRejectedValue(new Error("The diagram is too large to copy as an image."));
  click(host, "Copy as PNG");
  await settle();
  expect(d.notify).toHaveBeenCalledWith("The diagram is too large to copy as an image.");
  expect(button.textContent).toBe("Copy failed");
  vi.mocked(svgToPngBlob).mockResolvedValue(png);
  vi.mocked(d.copyImage).mockRejectedValue(new Error("denied"));
  click(host, "Copy as PNG");
  await settle();
  expect(d.notify).toHaveBeenCalledWith("Could not copy the image.");
});
it("reports an SVG clipboard failure", async () => {
  const { root, host } = diagram();
  const d = deps({ copyText: vi.fn().mockRejectedValue(new Error("denied")) });
  enhanceMermaid(root, d);
  const button = click(host, "Copy as SVG");
  await settle();
  expect(d.notify).toHaveBeenCalledWith("Could not copy the SVG.");
  expect(button.textContent).toBe("Copy failed");
});
it("adds nothing twice and nothing to a failed diagram", () => {
  const { root, host } = diagram();
  enhanceMermaid(root, deps()); enhanceMermaid(root, deps());
  expect(host.querySelectorAll(".mermaid-toolbar")).toHaveLength(1);
  const failed = diagram();
  failed.host.classList.add("mermaid-error");
  vi.mocked(mermaidResult).mockReturnValue({ code: "bad", error: "Parse error", line: null });
  enhanceMermaid(failed.root, deps());
  expect(failed.host.querySelectorAll(".mermaid-toolbar")).toHaveLength(0);
});

function failed(line: number | null = 4): ReturnType<typeof diagram> {
  const result = diagram();
  result.host.replaceChildren();
  result.host.classList.add("mermaid-error");
  result.host.textContent = "Mermaid error: raw";
  vi.mocked(mermaidResult).mockReturnValue({ code: "nonsense <b>x</b>", error: "Error: Parse error on line 1:\nmore detail", line });
  return result;
}
it("turns a failed diagram into a card with the first error line and a source toggle", () => {
  const { root, host } = failed();
  enhanceMermaid(root, deps());
  expect(host.classList.contains("mermaid-error-card")).toBe(true);
  expect(host.querySelector(".mermaid-error-message")!.textContent).toBe("Parse error on line 1:");
  const toggle = Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Show source")!;
  const pre = host.querySelector<HTMLElement>("pre.mermaid-error-source")!;
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(pre.hidden).toBe(true);
  toggle.click();
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(toggle.textContent).toBe("Hide source");
  expect(pre.hidden).toBe(false);
  expect(pre.textContent).toBe("nonsense <b>x</b>");
  expect(pre.children).toHaveLength(0);
  toggle.click();
  expect(pre.hidden).toBe(true);
  expect(Array.from(host.querySelectorAll("button")).some(b => b.textContent === "Fix with AI")).toBe(false);
  enhanceMermaid(root, deps());
  expect(host.querySelectorAll(".mermaid-error-message")).toHaveLength(1);
});
it("offers Fix with AI only when available and the line is known", () => {
  const fix = { available: () => true, run: vi.fn() };
  const ready = failed();
  enhanceMermaid(ready.root, deps({ fix }));
  Array.from(ready.host.querySelectorAll("button")).find(b => b.textContent === "Fix with AI")!.click();
  expect(fix.run).toHaveBeenCalledWith({ code: "nonsense <b>x</b>", error: "Error: Parse error on line 1:\nmore detail", line: 4 });
  const unavailable = failed();
  enhanceMermaid(unavailable.root, deps({ fix: { ...fix, available: () => false } }));
  expect(unavailable.host.textContent).not.toContain("Fix with AI");
  const unknown = failed(null);
  enhanceMermaid(unknown.root, deps({ fix }));
  expect(unknown.host.textContent).not.toContain("Fix with AI");
});
it.each(["", " \t\r\n "])("hides Fix with AI when the diagram source is empty (%j)", (code) => {
  const { root, host } = failed();
  vi.mocked(mermaidResult).mockReturnValue({ code, error: "No diagram type detected", line: 4 });
  const fix = { available: () => true, run: vi.fn() };
  enhanceMermaid(root, deps({ fix }));
  expect(host.querySelector(".mermaid-error-message")!.textContent).toBe("No diagram type detected");
  expect(Array.from(host.querySelectorAll("button")).some(b => b.textContent === "Fix with AI")).toBe(false);
  expect(fix.run).not.toHaveBeenCalled();
});
