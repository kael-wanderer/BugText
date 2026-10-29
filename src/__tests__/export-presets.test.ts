import { describe, expect, it } from "vitest";
import { BUILT_IN_PRESETS, lastPreset, parsePresets, presetSummary, presetsFor, rememberLast, validPresetName } from "../export/presets";

describe("export presets", () => {
  it("provides built-ins and drops invalid entries while retaining unknown fields", () => {
    const report = { ...BUILT_IN_PRESETS[2], extra: 42 };
    const settings = parsePresets({ extra: true, presets: [report, { ...report, page: { ...report.page, marginMm: 99 } }] });
    expect(settings.presets).toEqual([report]);
    expect(presetsFor(settings).map(p => p.id)).toEqual(["standard", "handout", "report"]);
    expect((settings as unknown as { extra: boolean }).extra).toBe(true);
  });
  it("replaces and resets a built-in", () => {
    const edit = { ...BUILT_IN_PRESETS[1], page: { ...BUILT_IN_PRESETS[1].page, marginMm: 30 } };
    expect(presetsFor(parsePresets({ presets: [edit] }))[1].page.marginMm).toBe(30);
    expect(presetsFor(parsePresets({}))[1].page.marginMm).toBe(20);
  });
  it("summarizes and validates names", () => {
    expect(presetSummary(BUILT_IN_PRESETS[2])).toBe("A4 · 25 mm · Typst default 11 pt · contents · numbered");
    expect(validPresetName(" report ", BUILT_IN_PRESETS)).toBe(false);
    expect(validPresetName("Report", BUILT_IN_PRESETS, "report")).toBe(true);
  });
  it("remembers last selection separately", () => {
    const settings = rememberLast(parsePresets({}), "pdf", "report");
    expect(lastPreset(settings, "pdf").id).toBe("report");
    expect(lastPreset(settings, "docx").id).toBe("standard");
  });
});
