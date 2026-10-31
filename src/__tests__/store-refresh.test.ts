import { expect, it, vi } from "vitest";
import type { TreeNode } from "../treeops";
vi.mock("../filesys", () => ({ listDir: vi.fn() }));
import { listDir } from "../filesys";
import { refreshDir, refreshExpandedDirs, setState, subscribe } from "../store";

it("notifies once for changes across expanded directories and never for unchanged entries", async () => {
  const children: TreeNode[] = Array.from({ length: 10 }, (_, i) => ({ name: `d${i}`, path: `/r/d${i}`, isDir: true, expanded: true, children: [] }));
  setState({ tree: { name: "r", path: "/r", isDir: true, expanded: true, children } });
  let changed = false, flip = false;
  vi.mocked(listDir).mockImplementation(async path => path === "/r" ? children.map(({ name, path, isDir }) => ({ name, path, isDir })) : path === "/r/d0" && changed ? [{ name: "x", path: "/r/d0/x", isDir: flip }] : []);
  const listener = vi.fn(); const unsubscribe = subscribe(listener);
  try {
    await refreshExpandedDirs(); expect(listener).not.toHaveBeenCalled();
    changed = true; await refreshExpandedDirs(); expect(listener).toHaveBeenCalledTimes(1);
    await refreshDir("/r/d0"); expect(listener).toHaveBeenCalledTimes(1);
    flip = true; await refreshDir("/r/d0"); expect(listener).toHaveBeenCalledTimes(2);
  } finally { unsubscribe(); }
});
