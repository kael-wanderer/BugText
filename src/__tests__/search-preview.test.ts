// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createSearchPreview } from "../search-preview";
const hit = (path: string) => ({path,relative:path,line:1,snippet:"hello",match_start:0,match_end:5});
it("ignores an older preview response and never interprets HTML", async () => {
  const pending = new Map<string,(s:string)=>void>(); const host = document.createElement("div");
  const preview = createSearchPreview(host,{read:path=>new Promise(resolve=>pending.set(path,resolve)),open:vi.fn()});
  const a = preview.show(hit("a")); const b = preview.show(hit("b")); pending.get("b")!("hello <img src=x>"); await b; pending.get("a")!("hello OLD"); await a;
  expect(host.textContent).toContain("hello <img src=x>"); expect(host.textContent).not.toContain("OLD"); expect(host.querySelector("img")).toBeNull();
});
it("does not open stale ambiguous results and follows a relocated unique match", async () => {
 const host=document.createElement("div"),open=vi.fn();let source="changed";
 const preview=createSearchPreview(host,{read:async()=>source,open}); await preview.open(hit("a"));expect(open).not.toHaveBeenCalled();
 source="intro\nhello";await preview.open(hit("a"));expect(open).toHaveBeenCalledWith("a",2,undefined);
});
