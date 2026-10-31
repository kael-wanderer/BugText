// @vitest-environment jsdom
import { expect, it } from "vitest";
import { loadProperties } from "../properties/loader";
import { createLinkIndex } from "../links/index";
import { createLinksPanel } from "../links/panel";
import { matchingNotes } from "../table-view/model";
import { createTableSurface } from "../table-view/surface";
import { largeFolder } from "./helpers/large-folder";

it("measures a large folder refresh, backlinks, links panel and table", async () => {
  await loadProperties();
  const fixture = largeFolder();
  const index = createLinkIndex(async (_folder, _paths, known) => known ? { notes: [], skipped: [], stamps: fixture.stamps } : fixture);
  await index.ensure("/notes");
  let start = performance.now(); await index.refresh(); const refresh = performance.now() - start;
  start = performance.now(); for (const note of fixture.notes.slice(0, 20)) index.backlinks(note.path); const backlinks = performance.now() - start;
  const host = document.createElement("div");
  start = performance.now(); await createLinksPanel(host, index, () => ({ path: fixture.notes[0].path, text: fixture.notes[0].source }), () => {}, () => {}).show(true); const panel = performance.now() - start;
  start = performance.now(); createTableSurface(document.createElement("div"), () => {}).update(matchingNotes(index.notes(), { tags: [], rows: [], folder: null, mode: "all" }), "/notes"); const table = performance.now() - start;
  console.log(`Large folder: refresh ${refresh.toFixed(2)} ms; backlinks ${backlinks.toFixed(2)} ms; panel ${panel.toFixed(2)} ms; table ${table.toFixed(2)} ms`);
  expect(Math.max(refresh, backlinks, panel, table)).toBeLessThan(2000);
}, 30000);
