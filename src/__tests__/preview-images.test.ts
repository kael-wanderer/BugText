// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { resolvePreviewImages } from "../preview-images";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("resolvePreviewImages", () => {
  beforeEach(() => invoke.mockReset());

  it("loads relative images from the note's folder through preview://", async () => {
    invoke.mockResolvedValue(undefined);
    const root = document.createElement("article");
    root.innerHTML = '<img src="assets/a%20b.png"><img src="https://x.test/r.png"><img src="data:image/png;base64,AA==">';
    resolvePreviewImages(root, "/Users/me/Notes/trip.md");
    await flush();
    const [local, remote, inline] = Array.from(root.querySelectorAll("img"));
    expect(local.getAttribute("src")).toBe("preview://localhost/Users/me/Notes/assets/a%20b.png");
    expect(remote.getAttribute("src")).toBe("https://x.test/r.png");
    expect(inline.getAttribute("src")).toContain("data:");
    expect(invoke).toHaveBeenCalledWith("preview_allow", { path: "/Users/me/Notes/trip.md" });
  });

  it("shows a placeholder for an image that fails to load", async () => {
    invoke.mockResolvedValue(undefined);
    const root = document.createElement("article");
    root.innerHTML = '<p><img src="assets/gone.png"></p>';
    resolvePreviewImages(root, "/Users/me/Other/n.md");
    await flush();
    root.querySelector("img")!.dispatchEvent(new Event("error"));
    expect(root.querySelector(".img-missing")?.textContent).toBe("Image not found · assets/gone.png");
  });

  it("shows a placeholder when the note is untitled", () => {
    const root = document.createElement("article");
    root.innerHTML = '<img src="assets/a.png">';
    resolvePreviewImages(root, null);
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".img-missing")).not.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
