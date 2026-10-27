import { isHtmlFile } from "./document-kind";

export type ExportFormat =
  | "doc-pdf"
  | "doc-docx"
  | "img-png"
  | "img-svg"
  | "pdf-copy";

export type ExportItem =
  | { label: string; format: ExportFormat }
  | { label: string; children: ExportItem[] };

export function exportOptionsFor(
  pathOrName: string | null | undefined,
): ExportItem[] {
  // A PDF is already the output format; its output action writes a copy.
  if (/\.pdf$/i.test(pathOrName ?? "")) return [{ label: "Save a Copy…", format: "pdf-copy" }];
  if (isHtmlFile(pathOrName)) {
    return [
      { label: "PNG Image…", format: "img-png" },
      { label: "SVG Image…", format: "img-svg" },
    ];
  }
  return [
    {
      label: "Document",
      children: [
        { label: "PDF…", format: "doc-pdf" },
        { label: "Word (DOCX)…", format: "doc-docx" },
      ],
    },
    {
      label: "Image",
      children: [
        { label: "PNG Image…", format: "img-png" },
        { label: "SVG Image…", format: "img-svg" },
      ],
    },
  ];
}
