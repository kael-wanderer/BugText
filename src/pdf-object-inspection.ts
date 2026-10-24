export type PdfOperatorMap = Partial<Record<string, number>>;

export type PdfPageObjectSignal = {
  page: number;
  imagePaints: number;
  vectorPaints: number;
  textPaints: number;
  annotationPaints: number;
  objects: PdfDetectedPageObject[];
};

export type PdfObjectRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfDetectedPageObject = {
  id: string;
  type: "image" | "vector" | "annotation";
  page: number;
  rect: PdfObjectRect;
  label?: string;
};

const IMAGE_OPERATORS = [
  "paintImageXObject",
  "paintImageXObjectRepeat",
  "paintInlineImageXObject",
  "paintInlineImageXObjectGroup",
  "paintJpegXObject",
];

const VECTOR_OPERATORS = [
  "constructPath",
  "stroke",
  "fill",
  "eoFill",
  "fillStroke",
  "eoFillStroke",
  "shadingFill",
];

const TEXT_OPERATORS = [
  "showText",
  "showSpacedText",
  "nextLineShowText",
  "nextLineSetSpacingShowText",
];

const GRAPHICS_SAVE_OPERATORS = ["save"];
const GRAPHICS_RESTORE_OPERATORS = ["restore"];
const TRANSFORM_OPERATORS = ["transform"];

function valuesFor(names: string[], ops: PdfOperatorMap): Set<number> {
  return new Set(
    names.flatMap((name) => {
      const value = ops[name];
      return typeof value === "number" ? [value] : [];
    }),
  );
}

function multiplyMatrix(
  left: [number, number, number, number, number, number],
  right: [number, number, number, number, number, number],
): [number, number, number, number, number, number] {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function numericMatrix(value: unknown): [number, number, number, number, number, number] | null {
  if (!Array.isArray(value) || value.length < 6) return null;
  const parts = value.slice(0, 6);
  if (!parts.every((part) => typeof part === "number" && Number.isFinite(part))) {
    return null;
  }
  return parts as [number, number, number, number, number, number];
}

/** Maps a PDF user-space point to page space (top-left origin, as the page is shown). */
export type PdfPointToPage = (x: number, y: number) => { x: number; y: number };

/** Page space for an unrotated page whose visible box starts at the origin. */
export function flipPdfPoint(pageHeight: number): PdfPointToPage {
  return (x, y) => ({ x, y: pageHeight - y });
}

function imageRectFromMatrix(
  toPage: PdfPointToPage,
  matrix: [number, number, number, number, number, number],
): PdfObjectRect | null {
  return rectFromPdfPoints(
    toPage,
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ].map(([x, y]) => transformPoint(matrix, x, y)),
  );
}

// Bounds of user-space points once mapped to page space, so rotated and cropped
// pages get the box the viewer shows.
function rectFromPdfPoints(
  toPage: PdfPointToPage,
  userPoints: Array<{ x: number; y: number }>,
): PdfObjectRect | null {
  if (!userPoints.length) return null;
  const points = userPoints.map((point) => toPage(point.x, point.y));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return { x: minX, y: minY, width, height };
}

function transformPoint(
  matrix: [number, number, number, number, number, number],
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function numericArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.filter((item) => typeof item === "number" && Number.isFinite(item));
  return values.length === value.length ? values : null;
}

function vectorRectFromConstructPath(
  toPage: PdfPointToPage,
  matrix: [number, number, number, number, number, number],
  args: unknown,
): PdfObjectRect | null {
  if (!Array.isArray(args)) return null;
  const minMax = numericArray(args[2]);
  if (minMax && minMax.length >= 4) {
    return rectFromPdfPoints(toPage, [
      transformPoint(matrix, minMax[0], minMax[1]),
      transformPoint(matrix, minMax[2], minMax[1]),
      transformPoint(matrix, minMax[0], minMax[3]),
      transformPoint(matrix, minMax[2], minMax[3]),
    ]);
  }
  const pathArgs = numericArray(args[1]);
  if (!pathArgs || pathArgs.length < 4) return null;
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index + 1 < pathArgs.length; index += 2) {
    points.push(transformPoint(matrix, pathArgs[index], pathArgs[index + 1]));
  }
  return rectFromPdfPoints(toPage, points);
}

export function inspectPdfPageOperators(
  page: number,
  fnArray: number[],
  ops: PdfOperatorMap,
  argsArray: unknown[] = [],
  pageHeight = 0,
  toPage: PdfPointToPage = flipPdfPoint(pageHeight),
): PdfPageObjectSignal {
  const images = valuesFor(IMAGE_OPERATORS, ops);
  const vectors = valuesFor(VECTOR_OPERATORS, ops);
  const vectorPainters = valuesFor(VECTOR_OPERATORS.filter((name) => name !== "constructPath"), ops);
  const text = valuesFor(TEXT_OPERATORS, ops);
  const saves = valuesFor(GRAPHICS_SAVE_OPERATORS, ops);
  const restores = valuesFor(GRAPHICS_RESTORE_OPERATORS, ops);
  const transforms = valuesFor(TRANSFORM_OPERATORS, ops);
  const stack: [number, number, number, number, number, number][] = [];
  let matrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  let pendingVectorRect: PdfObjectRect | null = null;
  return fnArray.reduce<PdfPageObjectSignal>(
    (summary, fn, index) => {
      if (saves.has(fn)) {
        stack.push(matrix);
      } else if (restores.has(fn)) {
        matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      } else if (transforms.has(fn)) {
        const next = numericMatrix(argsArray[index]);
        if (next) matrix = multiplyMatrix(matrix, next);
      } else if (ops.constructPath === fn && pageHeight > 0) {
        pendingVectorRect = vectorRectFromConstructPath(
          toPage,
          matrix,
          argsArray[index],
        );
      }

      const isImage = images.has(fn);
      const object =
        isImage && pageHeight > 0 ? imageRectFromMatrix(toPage, matrix) : null;
      const vectorObject = vectorPainters.has(fn) ? pendingVectorRect : null;
      if (vectorPainters.has(fn)) pendingVectorRect = null;
      const detectedObject: PdfDetectedPageObject | null = object
        ? {
            id: `page-${page}-image-${summary.objects.length + 1}`,
            type: "image",
            page,
            rect: object,
          }
        : vectorObject
          ? {
              id: `page-${page}-vector-${summary.objects.length + 1}`,
              type: "vector",
              page,
              rect: vectorObject,
            }
          : null;
      return {
        page,
        imagePaints: summary.imagePaints + (isImage ? 1 : 0),
        vectorPaints: summary.vectorPaints + (vectors.has(fn) ? 1 : 0),
        textPaints: summary.textPaints + (text.has(fn) ? 1 : 0),
        annotationPaints: summary.annotationPaints,
        objects: detectedObject ? [...summary.objects, detectedObject] : summary.objects,
      };
    },
    {
      page,
      imagePaints: 0,
      vectorPaints: 0,
      textPaints: 0,
      annotationPaints: 0,
      objects: [],
    },
  );
}

export type PdfAnnotationLike = {
  rect?: unknown;
  subtype?: string;
  annotationType?: string | number;
  id?: string;
};

function annotationRectFromPdfRect(
  toPage: PdfPointToPage,
  rawRect: unknown,
): PdfObjectRect | null {
  const values = numericArray(rawRect);
  if (!values || values.length < 4) return null;
  return rectFromPdfPoints(toPage, [
    { x: values[0], y: values[1] },
    { x: values[2], y: values[3] },
  ]);
}

export function inspectPdfPageAnnotations(
  page: number,
  pageHeight: number,
  annotations: PdfAnnotationLike[],
  toPage: PdfPointToPage = flipPdfPoint(pageHeight),
): PdfPageObjectSignal {
  const objects = annotations.flatMap((annotation, index) => {
    const rect = pageHeight > 0 ? annotationRectFromPdfRect(toPage, annotation.rect) : null;
    if (!rect) return [];
    const label =
      typeof annotation.subtype === "string"
        ? annotation.subtype
        : typeof annotation.annotationType === "string"
          ? annotation.annotationType
          : "Annotation";
    return [
      {
        id:
          typeof annotation.id === "string" && annotation.id
            ? `page-${page}-annotation-${annotation.id}`
            : `page-${page}-annotation-${index + 1}`,
        type: "annotation" as const,
        page,
        rect,
        label,
      },
    ];
  });
  return {
    page,
    imagePaints: 0,
    vectorPaints: 0,
    textPaints: 0,
    annotationPaints: objects.length,
    objects,
  };
}

export function mergePdfPageObjectSignals(
  base: PdfPageObjectSignal,
  extra: PdfPageObjectSignal,
): PdfPageObjectSignal {
  return {
    page: base.page,
    imagePaints: base.imagePaints + extra.imagePaints,
    vectorPaints: base.vectorPaints + extra.vectorPaints,
    textPaints: base.textPaints + extra.textPaints,
    annotationPaints: base.annotationPaints + extra.annotationPaints,
    objects: [...base.objects, ...extra.objects],
  };
}

export function pdfObjectSignalMessage(signal: PdfPageObjectSignal): string {
  const parts = [
    signal.imagePaints ? `${signal.imagePaints} image paint${signal.imagePaints === 1 ? "" : "s"}` : "",
    signal.vectorPaints ? `${signal.vectorPaints} vector paint${signal.vectorPaints === 1 ? "" : "s"}` : "",
    signal.textPaints ? `${signal.textPaints} text paint${signal.textPaints === 1 ? "" : "s"}` : "",
    signal.annotationPaints ? `${signal.annotationPaints} annotation${signal.annotationPaints === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length
    ? `Objects: ${parts.join(", ")}`
    : "Objects: no page drawing operators detected";
}
