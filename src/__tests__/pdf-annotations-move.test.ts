import { expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
import { movePdfAnnotations } from "../pdf-annotations/move";
it("forwards file and folder moves to native storage", async () => {
  await movePdfAnnotations("/root/a.pdf", "/root/b.pdf");
  await movePdfAnnotations("/root/papers", "/root/archive");
  expect(invoke).toHaveBeenNthCalledWith(1, "pdf_annotations_move", { from: "/root/a.pdf", to: "/root/b.pdf" });
  expect(invoke).toHaveBeenNthCalledWith(2, "pdf_annotations_move", { from: "/root/papers", to: "/root/archive" });
});
