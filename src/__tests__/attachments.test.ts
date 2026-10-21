import { expect, it, vi } from "vitest";
import { prepareCliAttachments } from "../ai/attachments";
it("inlines out-of-folder CLI attachments and only passes in-folder paths", async () => {
  const read = vi.fn(async () => "secret note contents");
  const result = await prepareCliAttachments(
    ["/notes/a.md", "/outside/private.md"], "/notes", read,
  );
  expect(result.files).toEqual([{ kind: "text", name: "private.md", content: "secret note contents" }]);
  expect(result.paths).toEqual(["/notes/a.md"]);
  expect(read).toHaveBeenCalledWith("/outside/private.md");
});
it("skips binary and image attachments with their names", async () => {
  const result = await prepareCliAttachments(["/tmp/photo.png"], null, vi.fn());
  expect(result.skipped).toEqual(["photo.png"]);
  expect(result.files).toEqual([]);
  expect(result.paths).toEqual([]);
});
