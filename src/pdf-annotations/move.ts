import { invoke } from "@tauri-apps/api/core";
/** The native command handles both a PDF path and a directory prefix. */
export function movePdfAnnotations(from: string, to: string): Promise<void> {
  return invoke("pdf_annotations_move", { from, to });
}
