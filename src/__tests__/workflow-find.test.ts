import { expect, it } from "vitest";
import { createNavigationHistory } from "../navigation/history";
import { validSavedView, relativeDateRange, evaluateSavedView, type SavedView } from "../saved-views/model";
import { renameBookmarks, resolveBookmarkHeading, validBookmark } from "../navigation/bookmarks";
import { excerptLines } from "../search-preview";
it("restores positions and drops forward history on a new branch", () => {
  const h = createNavigationHistory(3); h.visit({path:"a",line:1}); h.capture({path:"a",line:20}); h.visit({path:"b"}); h.visit({path:"c"});
  expect(h.back()?.path).toBe("b"); expect(h.back()?.line).toBe(20); expect(h.forward()?.path).toBe("b"); h.visit({path:"d"}); expect(h.canForward).toBe(false); h.rename("d","new"); expect(h.current?.path).toBe("new");
});
it("resolves calendar presets across month and leap boundaries", () => {
  expect(relativeDateRange("this-week", new Date(2024,2,1))).toEqual(["2024-02-26","2024-03-03"]);
  expect(relativeDateRange("today",new Date(2024,1,29))).toEqual(["2024-02-29","2024-02-29"]);
});
it("validates view predicate operators and sorts missing dates last", () => {
  const view: SavedView = {id:"1",name:"Projects",folder:"/r",filter:{tags:[],rows:[],folder:null,mode:"all"},sort:"date",descending:true};
  expect(validSavedView(view)).toBe(true); expect(validSavedView({...view,filter:{...view.filter,rows:[{key:"a",op:"eval",value:""}]}})).toBe(false);
  const note = (path:string,date?:string) => ({path,source:"",headings:[],links:[],tags:[],properties:date ? {date}: {}});
  expect(evaluateSavedView([note("a"),note("b","2026-01-01"),note("c","2026-10-01")],view).map(n=>n.path)).toEqual(["c","b","a"]);
});
it("does not resolve ambiguous or renamed headings to a different heading", () => {
  expect(resolveBookmarkHeading("# New\n# Same\n# Same",{kind:"note",path:"a.md",anchor:"old",heading:"Same"})).toEqual({line:1,missing:true});
  expect(resolveBookmarkHeading("# Changed\n# Title",{kind:"note",path:"a.md",anchor:"old",heading:"Title"})).toEqual({line:2,missing:false});
});
it("rejects escaped bookmarks and updates only known matching paths", () => {
  expect(validBookmark({id:"a",label:"A",folder:"/r",destination:{kind:"note",path:"../a"}})).toBe(false);
  expect(renameBookmarks([{id:"a",label:"A",folder:"/r",destination:{kind:"note",path:"old/a.md"}}],"/r","old","new")[0].destination).toEqual({kind:"note",path:"new/a.md"});
});
it("bounds excerpts and preserves source line numbers", () => { expect(excerptLines("a\nb\nc\nd\ne",3,1).lines).toEqual([{line:2,text:"b"},{line:3,text:"c"},{line:4,text:"d"}]); });
