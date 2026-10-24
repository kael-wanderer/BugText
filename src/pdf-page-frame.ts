import type { PdfPageBox, PdfRect } from "./pdf-edit-document";

export type PdfPageRotation = 0 | 90 | 180 | 270;

export type PdfBounds = { x: number; y: number; width: number; height: number };

/**
 * Maps the editor's page space (top-left origin, in the orientation the page is
 * shown, cropped to the visible box) to PDF user space for one page.
 */
export type PdfPageFrame = {
  /** Page size as shown on screen; width and height swap for 90/270 rotation. */
  box: PdfPageBox;
  rotation: PdfPageRotation;
  toPdf: (x: number, y: number) => { x: number; y: number };
};

export function normalizePdfRotation(angle: number): PdfPageRotation {
  const quarter = Math.round((((angle % 360) + 360) % 360) / 90) % 4;
  return (quarter * 90) as PdfPageRotation;
}

/** The box a viewer shows: the crop box clipped to the media box. */
export function visiblePdfBounds(cropBox: PdfBounds, mediaBox: PdfBounds): PdfBounds {
  const x = Math.max(cropBox.x, mediaBox.x);
  const y = Math.max(cropBox.y, mediaBox.y);
  const right = Math.min(cropBox.x + cropBox.width, mediaBox.x + mediaBox.width);
  const top = Math.min(cropBox.y + cropBox.height, mediaBox.y + mediaBox.height);
  if (right <= x || top <= y) return mediaBox;
  return { x, y, width: right - x, height: top - y };
}

export function createPdfPageFrame(
  page: number,
  view: PdfBounds,
  angle: number,
): PdfPageFrame {
  const rotation = normalizePdfRotation(angle);
  const { x: left, y: bottom, width, height } = view;
  const right = left + width;
  const top = bottom + height;
  // A viewer turns the page clockwise by `rotation`; screen right and down are
  // these user-space directions, starting from the corner shown top-left.
  const toPdf =
    rotation === 90
      ? (x: number, y: number) => ({ x: left + y, y: bottom + x })
      : rotation === 180
        ? (x: number, y: number) => ({ x: right - x, y: bottom + y })
        : rotation === 270
          ? (x: number, y: number) => ({ x: right - y, y: top - x })
          : (x: number, y: number) => ({ x: left + x, y: top - y });
  const sideways = rotation === 90 || rotation === 270;
  return {
    box: { page, width: sideways ? height : width, height: sideways ? width : height },
    rotation,
    toPdf,
  };
}

/** The user-space rectangle covering an on-screen rectangle (axis-aligned for quarter turns). */
export function frameRectToPdf(frame: PdfPageFrame, rect: PdfRect): PdfBounds {
  const a = frame.toPdf(rect.x, rect.y);
  const b = frame.toPdf(rect.x + rect.width, rect.y + rect.height);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}
