// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isFileOpBusy, runExclusiveFileOp } from "../file-op-guard";

describe("runExclusiveFileOp", () => {
  it("ignores a second operation while the first is running", async () => {
    let release!: () => void;
    let runs = 0;
    const first = runExclusiveFileOp(async () => {
      runs += 1;
      await new Promise<void>((resolve) => (release = resolve));
      return "done";
    });
    expect(isFileOpBusy()).toBe(true);
    expect(await runExclusiveFileOp(async () => { runs += 1; return "second"; })).toBeUndefined();
    release();
    expect(await first).toBe("done");
    expect(runs).toBe(1);
    expect(isFileOpBusy()).toBe(false);
  });

  it("releases after a failure so the next operation can run", async () => {
    await expect(runExclusiveFileOp(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(isFileOpBusy()).toBe(false);
    expect(await runExclusiveFileOp(async () => "ok")).toBe("ok");
  });

  it("marks the body busy while running", async () => {
    await runExclusiveFileOp(async () => {
      expect(document.body.classList.contains("file-op-busy")).toBe(true);
    });
    expect(document.body.classList.contains("file-op-busy")).toBe(false);
  });
});
