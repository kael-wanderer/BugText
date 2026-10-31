// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
const pick = vi.hoisted(() => vi.fn(async () => null));
vi.mock("../filesys", async importOriginal => ({ ...(await importOriginal<typeof import("../filesys")>()), pickFolder: pick }));
import { initExplorer } from "../explorer";
import { setState } from "../store";
it("updates explorer empty states and invokes their actions", () => {
  document.body.innerHTML = `<aside id="explorer"><header class="explorer-header"><button id="ex-root"></button><span id="explorer-folder-name"></span></header><button id="ex-new-file"></button><button id="ex-new-folder"></button><button id="ex-refresh"></button><button id="ex-collapse"></button><button id="ex-more"></button><div id="explorer-tree"></div><div id="explorer-empty-folder"></div><div id="explorer-empty"><button id="explorer-empty-open"></button><button id="explorer-empty-open-file"></button><kbd id="explorer-open-folder-hint"></kbd><kbd id="explorer-open-file-hint"></kbd></div></aside>`;
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const openFile = vi.fn(), newNote = vi.fn(), template = vi.fn(), daily = vi.fn(); let hidden = false;
  initExplorer(() => {}, () => {}, { onOpenFile: openFile, onNewNote: newNote, onNewFromTemplateRoot: template, onDailyNote: daily, isShowingHidden: () => hidden, keyHint: () => "⌘N" });
  document.getElementById("explorer-empty-open")!.click(); document.getElementById("explorer-empty-open-file")!.click();
  expect(pick).toHaveBeenCalledOnce(); expect(openFile).toHaveBeenCalledOnce();
  const root = { name: '<img src=x onerror=alert(1)>', path: "/r", isDir: true, expanded: true, children: [] };
  setState({ folder: "/r", tree: root }); const panel = document.getElementById("explorer-empty-folder")!;
  expect(panel.textContent).toContain("This folder is empty.");
  for (const button of panel.querySelectorAll("button")) button.click();
  expect(newNote).toHaveBeenCalledOnce(); expect(template).toHaveBeenCalledOnce(); expect(daily).toHaveBeenCalledOnce();
  const dot = { name: ".DS_Store", path: "/r/.DS_Store", isDir: false, expanded: false, children: null };
  setState({ tree: { ...root, children: [dot] } }); expect(panel.hidden).toBe(false);
  hidden = true; setState({ tree: { ...root, children: [dot] } }); expect(panel.hidden).toBe(true);
  setState({ tree: { ...root, children: [{ ...dot, name: "a.md", path: "/r/a.md" }] } }); expect(panel.hidden).toBe(true);
  expect(document.querySelector("img")).toBeNull(); vi.unstubAllGlobals();
});
