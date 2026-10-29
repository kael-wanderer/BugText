import { expect, it, vi, beforeEach } from "vitest";
const invoke = vi.hoisted(()=>vi.fn());
vi.mock("@tauri-apps/api/core",()=>({invoke}));
vi.mock("@tauri-apps/api/event",()=>({listen:vi.fn(async()=>()=>{})}));
import { createSavedViewStore } from "../saved-views/store";
beforeEach(()=>invoke.mockReset());
const view={id:"a",name:"A",folder:"/r",filter:{tags:[],rows:[],folder:null,mode:"all"},sort:"path",descending:false};
it("keeps a malformed file read-only and never writes a reset",async()=>{
 invoke.mockResolvedValue({version:99,revision:1,items:[]});const s=createSavedViewStore();await s.reload();expect(s.error).toContain("invalid");await expect(s.update(()=>[])).rejects.toThrow();expect(invoke).toHaveBeenCalledTimes(1);s.dispose();
});
it("passes expected revision and reloads conflict without silently retrying",async()=>{
 invoke.mockResolvedValueOnce({version:1,revision:3,items:[view]});const s=createSavedViewStore();await s.reload();
 invoke.mockRejectedValueOnce("revision conflict").mockResolvedValueOnce({version:1,revision:4,items:[{...view,name:"Remote"}]});await expect(s.update(items=>items.map(v=>({...v,name:"Local"})))).rejects.toThrow("revision conflict");expect(s.items[0].name).toBe("Remote");expect(invoke.mock.calls[1][1].expectedRevision).toBe(3);s.dispose();
});
