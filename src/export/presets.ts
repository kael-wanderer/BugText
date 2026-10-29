export type ExportPreset = {
  id: string; name: string; builtIn?: "standard" | "handout" | "report";
  page: { size: "a4" | "us-letter" | "a5" | "us-legal"; marginMm: number; numbers: "none" | "n" | "n-of-total" };
  type: { font: string | null; sizePt: number; lineSpacing: 1 | 1.15 | 1.5 };
  title: { mode: "none" | "first-heading" | "file-name"; author: string; date: "none" | "export" };
  contents: { toc: boolean; depth: number; numbered: boolean };
};
export type ExportSettings = { presets: ExportPreset[]; last: { pdf: string; docx: string } };
export type ExportFormat = "pdf" | "docx";

const base: ExportPreset = { id: "standard", name: "Standard", builtIn: "standard", page: { size: "a4", marginMm: 25, numbers: "none" }, type: { font: null, sizePt: 11, lineSpacing: 1.15 }, title: { mode: "none", author: "", date: "none" }, contents: { toc: false, depth: 2, numbered: false } };
export const BUILT_IN_PRESETS: ExportPreset[] = [base,
  { ...base, id: "handout", name: "Handout", builtIn: "handout", page: { ...base.page, marginMm: 20, numbers: "n" }, title: { ...base.title, mode: "first-heading", date: "export" } },
  { ...base, id: "report", name: "Report", builtIn: "report", page: { ...base.page, numbers: "n-of-total" }, title: { ...base.title, mode: "first-heading", date: "export" }, contents: { toc: true, depth: 2, numbered: true } },
];
const object = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
function valid(x: unknown): x is ExportPreset {
  if (!object(x) || !object(x.page) || !object(x.type) || !object(x.title) || !object(x.contents)) return false;
  const { page: p, type: t, title: a, contents: c } = x;
  return typeof x.id === "string" && x.id.length > 0 && typeof x.name === "string" && x.name.trim().length > 0 && x.name.length <= 40 &&
    (x.builtIn === undefined || ((x.builtIn === "handout" || x.builtIn === "report") && x.id === x.builtIn)) &&
    ["a4", "us-letter", "a5", "us-legal"].includes(p.size) && Number.isInteger(p.marginMm) && p.marginMm >= 10 && p.marginMm <= 50 && ["none", "n", "n-of-total"].includes(p.numbers) &&
    (t.font === null || (typeof t.font === "string" && /^[A-Za-z0-9 ._-]{1,64}$/.test(t.font))) && Number.isInteger(t.sizePt) && t.sizePt >= 9 && t.sizePt <= 16 && [1, 1.15, 1.5].includes(t.lineSpacing) &&
    ["none", "first-heading", "file-name"].includes(a.mode) && typeof a.author === "string" && a.author.length <= 80 && ["none", "export"].includes(a.date) &&
    typeof c.toc === "boolean" && Number.isInteger(c.depth) && c.depth >= 1 && c.depth <= 3 && typeof c.numbered === "boolean" && x.id !== "standard";
}
export function parsePresets(raw: unknown): ExportSettings {
  const data = object(raw) ? raw : {};
  const last = object(data.last) ? data.last : {};
  return { ...data, presets: Array.isArray(data.presets) ? data.presets.filter(valid) : [], last: { ...last, pdf: typeof last.pdf === "string" ? last.pdf : "standard", docx: typeof last.docx === "string" ? last.docx : "standard" } };
}
export function presetsFor(settings: ExportSettings): ExportPreset[] {
  return [...BUILT_IN_PRESETS.map(p => settings.presets.find(s => s.id === p.id && s.builtIn === p.builtIn) ?? p), ...settings.presets.filter(p => !p.builtIn)];
}
export function lastPreset(settings: ExportSettings, format: ExportFormat): ExportPreset {
  const all = presetsFor(settings); return all.find(p => p.id === settings.last[format]) ?? all[0];
}
export function rememberLast(settings: ExportSettings, format: ExportFormat, id: string): ExportSettings {
  return { ...settings, last: { ...settings.last, [format]: id } };
}
export function validPresetName(name: string, presets: ExportPreset[], exceptId?: string): boolean {
  const trimmed = name.trim(); return trimmed.length > 0 && name.length <= 40 && !presets.some(p => p.id !== exceptId && p.name.trim().toLowerCase() === trimmed.toLowerCase());
}
export function presetSummary(p: ExportPreset): string {
  if (p.id === "standard") return "Today's output";
  const sizes = { a4: "A4", "us-letter": "US Letter", a5: "A5", "us-legal": "US Legal" };
  return [sizes[p.page.size], `${p.page.marginMm} mm`, `${p.type.font ?? "Typst default"} ${p.type.sizePt} pt`, ...(p.contents.toc ? ["contents"] : []), ...(p.contents.numbered ? ["numbered"] : [])].join(" · ");
}
