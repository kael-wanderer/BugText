// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { createNoteImages, type NoteImageDeps } from "../note-images";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function setup(path: string | null) {
  const deps = {
    folder: () => "assets",
    pasteName: () => "note" as const,
    ensureSaved: vi.fn(async () => path),
    insert: vi.fn(),
    toast: vi.fn(),
    error: vi.fn(async () => {}),
  } satisfies NoteImageDeps;
  return { deps, images: createNoteImages(deps) };
}

function pngFile(): File {
  const file = new File([PNG], "image.png", { type: "image/png" });
  // jsdom's File lacks arrayBuffer.
  Object.defineProperty(file, "arrayBuffer", { value: async () => PNG.buffer });
  return file;
}

describe("note images", () => {
  beforeEach(() => invoke.mockReset());

  it("pastes an image and puts the cursor in the alt text", async () => {
    invoke.mockResolvedValue({ link: "assets/n-1.png", name: "n-1.png", copied: true });
    const { deps, images } = setup("/notes/n.md");
    await images.paste("w", "t", [pngFile()]);
    const [, args] = invoke.mock.calls[0];
    expect(invoke.mock.calls[0][0]).toBe("save_note_image");
    expect(args).toMatchObject({ notePath: "/notes/n.md", folder: "assets" });
    expect(args.nameHint).toMatch(/^n-\d{8}-\d{6}$/);
    expect(args.bytes).toEqual(Array.from(PNG));
    expect(deps.insert).toHaveBeenCalledWith("w", "t", "![](assets/n-1.png)", undefined, 2);
    expect(deps.toast).toHaveBeenCalledWith("Added n-1.png to assets/");
  });

  it("does nothing when an untitled note is not saved", async () => {
    const { deps, images } = setup(null);
    await images.paste("w", "t", [pngFile()]);
    await images.drop("w", "t", ["/x/a.png"], 0);
    expect(invoke).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("drops images at the drop point and reports refused files", async () => {
    invoke
      .mockResolvedValueOnce({ link: "assets/Shot 1.png", name: "Shot 1.png", copied: true })
      .mockRejectedValueOnce("\"big.png\" is larger than 25 MB.")
      .mockResolvedValueOnce({ link: "assets/old.jpg", name: "old.jpg", copied: false });
    const { deps, images } = setup("/notes/n.md");
    await images.drop("w", "t", ["/d/Shot 1.png", "/d/big.png", "/notes/assets/old.jpg"], 12);
    expect(deps.insert).toHaveBeenCalledWith("w", "t", "![Shot 1](assets/Shot%201.png)\n![old](assets/old.jpg)", 12);
    expect(deps.toast).toHaveBeenCalledWith("Added Shot 1.png to assets/");
    expect(deps.error).toHaveBeenCalledWith("\"big.png\" is larger than 25 MB.");
  });
});
