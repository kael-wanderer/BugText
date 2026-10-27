import { expect, it } from "vitest";
import { clampPdfZoom, parsePageInput, pdfFitZoom, pdfZoomLabel } from "../pdf-navigation";

it("accepts page numbers inside the document", () => {
  expect(parsePageInput("1", 12)).toEqual({ ok: true, page: 1 });
  expect(parsePageInput(" 12 ", 12)).toEqual({ ok: true, page: 12 });
});

it("rejects out-of-range and non-numeric page input", () => {
  const error = { ok: false, message: "Enter a page from 1 to 12" };
  for (const text of ["0", "13", "", "  ", "-1", "2.5", "1e1", "abc", "3a", "+2"]) {
    expect(parsePageInput(text, 12)).toEqual(error);
  }
  expect(parsePageInput("1", 0)).toEqual({ ok: false, message: "This PDF has no pages" });
});

it("fits a page to the view width or the whole page", () => {
  const page = { width: 464, height: 664 };
  const view = { width: 1000, height: 700 };
  expect(pdfFitZoom("width", page, view, 18)).toBeCloseTo(1000 / 500);
  expect(pdfFitZoom("page", page, view, 18)).toBeCloseTo(700 / 700);
  // Auto never enlarges past 100%.
  expect(pdfFitZoom("auto", page, view, 18)).toBe(1);
  expect(pdfFitZoom("auto", page, { width: 250, height: 700 }, 18)).toBeCloseTo(0.5);
});

it("uses the page's own shape for landscape and rotated pages", () => {
  const landscape = { width: 864, height: 464 };
  expect(pdfFitZoom("page", landscape, { width: 900, height: 1000 }, 18)).toBeCloseTo(900 / 900);
});

it("keeps fit zoom inside the supported range", () => {
  expect(pdfFitZoom("width", { width: 10, height: 10 }, { width: 5000, height: 5000 }, 0)).toBe(3);
  expect(pdfFitZoom("page", { width: 5000, height: 5000 }, { width: 10, height: 10 }, 0)).toBe(0.25);
  expect(pdfFitZoom("width", { width: 0, height: 0 }, { width: 0, height: 0 }, 0)).toBe(1);
  expect(clampPdfZoom(Number.NaN)).toBe(1);
});

it("labels fit modes by name and custom zoom by percent", () => {
  expect(pdfZoomLabel(1.234, null)).toBe("123%");
  expect(pdfZoomLabel(0.5, "width")).toBe("Fit Width");
  expect(pdfZoomLabel(0.5, "page")).toBe("Fit Page");
  expect(pdfZoomLabel(0.5, "auto")).toBe("Auto");
});
