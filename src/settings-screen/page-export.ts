import { BUILT_IN_PRESETS, presetsFor, validPresetName, type ExportPreset } from "../export/presets";
import type { ExportDiagnostics } from "../export/export-sheet";
import { button, caption, group, pageHeader, row } from "./controls";
import type { SettingsPage } from "./screen";

let selectedId = "standard";
export function selectExportPreset(id: string): void { selectedId = id; }

export const exportPage: SettingsPage = {
  id: "export",
  render(host, deps) {
    let diagnostics: ExportDiagnostics | null = null;
    let deleted: ExportPreset | null = null;
    let naming: "new" | "duplicate" | "rename" | null = null;
    const save = (presets: ExportPreset[]) => { const settings = deps.getSettings(); deps.onSettingsChange({ ...settings, export: { ...settings.export, presets } }); };
    const draw = () => {
      host.replaceChildren(); pageHeader(host, "export"); host.append(caption("Tools"));
      for (const name of ["pandoc", "typst"] as const) {
        const info = diagnostics?.[name]; const label = name === "pandoc" ? "Pandoc" : "Typst";
        const status = document.createElement("span"); status.textContent = !info ? "Checking…" : info.found ? `${info.version} · ${info.path}` : `Not installed · brew install ${name}`;
        const controls = group(status);
        if (info && !info.found) controls.append(button("Copy", () => { void deps.exportTools?.copy(`brew install ${name}`); }));
        host.append(row(`export-${name}`, label, null, controls));
      }
      host.append(button("Check again", () => { void check(true); }), caption("Presets"));
      const settings = deps.getSettings().export; const presets = presetsFor(settings);
      let selected = presets.find(p => p.id === selectedId) ?? presets[0]; selectedId = selected.id;
      const picker = document.createElement("select"); picker.setAttribute("aria-label", "Export preset");
      for (const p of presets) { const option = document.createElement("option"); option.value = p.id; option.textContent = p.name; picker.append(option); }
      picker.value = selectedId; picker.onchange = () => { selectedId = picker.value; naming = null; draw(); };
      host.append(row("export-preset", "Preset", null, picker));
      const duplicate = button("Duplicate", () => { naming = "duplicate"; draw(); });
      const rename = button("Rename", () => { naming = "rename"; draw(); }); rename.disabled = !!selected.builtIn;
      const remove = button("Delete", () => { deleted = selected; save(settings.presets.filter(p => p.id !== selected.id)); selectedId = "standard"; draw(); }); remove.disabled = !!selected.builtIn;
      const reset = button("Reset", () => { save(settings.presets.filter(p => p.id !== selected.id)); draw(); }); reset.disabled = !selected.builtIn || selected.id === "standard" || !settings.presets.some(p => p.id === selected.id);
      host.append(group(button("New", () => { naming = "new"; draw(); }), duplicate, rename, remove, reset));
      if (deleted) { const toast = document.createElement("div"); toast.setAttribute("role", "status"); toast.append(document.createTextNode(`Deleted "${deleted.name}" · `), button("Undo", () => { if (deleted) { const current = deps.getSettings().export; save([...current.presets, deleted]); selectedId = deleted.id; deleted = null; draw(); } })); host.append(toast); }
      if (naming) {
        const input = document.createElement("input"); input.setAttribute("aria-label", "Preset name"); input.maxLength = 40; input.value = naming === "rename" ? selected.name : naming === "duplicate" ? `${selected.name} copy` : "New preset";
        const error = document.createElement("p"); error.setAttribute("role", "alert");
        const saveName = button("Save name", () => {
          const name = input.value.trim();
          if (!validPresetName(name, presets, naming === "rename" ? selected.id : undefined)) { error.textContent = "Enter a unique name (1–40 characters)."; return; }
          if (naming === "rename") { save(settings.presets.map(p => p.id === selected.id ? { ...p, name } : p)); }
          else { const source = naming === "duplicate" ? selected : BUILT_IN_PRESETS[1]; const id = `preset-${crypto.randomUUID()}`; const { builtIn: _builtIn, ...copy } = source; save([...settings.presets, { ...copy, id, name }]); selectedId = id; }
          naming = null; draw();
        });
        host.append(group(input, saveName, button("Cancel", () => { naming = null; draw(); })), error); input.focus(); input.select();
      }
      const disabled = selected.id === "standard";
      const update = (patch: Partial<ExportPreset>) => { if (disabled) return; selected = { ...selected, ...patch }; const stored = deps.getSettings().export.presets;
        // Edit in place so a user preset keeps its position in the list.
        save(stored.some(p => p.id === selected.id) ? stored.map(p => p.id === selected.id ? selected : p) : [...stored, selected]); if (selected.builtIn && selected.id !== "standard") reset.disabled = false; };
      const choose = (label: string, value: string, values: [string, string][], change: (v: string) => void) => {
        const el = document.createElement("select"); el.setAttribute("aria-label", label); el.disabled = disabled;
        for (const [v, text] of values) { const option = document.createElement("option"); option.value = v; option.textContent = text; el.append(option); }
        el.value = value; el.onchange = () => change(el.value); return el;
      };
      const number = (label: string, value: number, min: number, max: number, change: (v: number) => void) => {
        const el = document.createElement("input"); el.type = "number"; el.setAttribute("aria-label", label); el.min = String(min); el.max = String(max); el.value = String(value); el.disabled = disabled;
        el.onchange = () => { const n = Number(el.value); if (Number.isInteger(n) && n >= min && n <= max) { el.setAttribute("aria-invalid", "false"); change(n); } else el.setAttribute("aria-invalid", "true"); }; return el;
      };
      host.append(caption("Page · PDF only"), row("export-page-size", "Page size", null, choose("Page size", selected.page.size, [["a4","A4"],["us-letter","US Letter"],["a5","A5"],["us-legal","US Legal"]], v => update({ page: { ...selected.page, size: v as ExportPreset["page"]["size"] } }))),
        row("export-margins", "Margins", "mm", number("Margins", selected.page.marginMm, 10, 50, v => update({ page: { ...selected.page, marginMm: v } }))),
        row("export-page-numbers", "Page numbers", null, choose("Page numbers", selected.page.numbers, [["none","None"],["n","1"],["n-of-total","1 / 12"]], v => update({ page: { ...selected.page, numbers: v as ExportPreset["page"]["numbers"] } }))));
      host.append(caption("Type · PDF only"));
      const fonts = [...new Set([...(diagnostics?.fonts ?? []).filter(f => /^[A-Za-z0-9 ._-]{1,64}$/.test(f)), ...(selected.type.font ? [selected.type.font] : [])])];
      host.append(row("export-font", "Body font", null, choose("Body font", selected.type.font ?? "", [["","Typst default"], ...fonts.map((f): [string,string] => [f,f])], v => update({ type: { ...selected.type, font: v || null } }))),
        row("export-font-size", "Font size", "pt", number("Font size", selected.type.sizePt, 9, 16, v => update({ type: { ...selected.type, sizePt: v } }))),
        row("export-line-spacing", "Line spacing", null, choose("Line spacing", String(selected.type.lineSpacing), [["1","1.0"],["1.15","1.15"],["1.5","1.5"]], v => update({ type: { ...selected.type, lineSpacing: Number(v) as 1 | 1.15 | 1.5 } }))));
      host.append(caption("Title · PDF and Word"), row("export-title", "Title block", null, choose("Title block", selected.title.mode, [["none","None"],["first-heading","First heading"],["file-name","File name"]], v => update({ title: { ...selected.title, mode: v as ExportPreset["title"]["mode"] } }))));
      const author = document.createElement("input"); author.setAttribute("aria-label", "Author"); author.maxLength = 80; author.value = selected.title.author; author.disabled = disabled; author.onchange = () => update({ title: { ...selected.title, author: author.value } });
      host.append(row("export-author", "Author", null, author), row("export-date", "Date", null, choose("Date", selected.title.date, [["none","None"],["export","Export date"]], v => update({ title: { ...selected.title, date: v as ExportPreset["title"]["date"] } }))));
      const checkBox = (label: string, value: boolean, change: (v: boolean) => void) => { const el = document.createElement("input"); el.type = "checkbox"; el.setAttribute("aria-label", label); el.checked = value; el.disabled = disabled; el.onchange = () => change(el.checked); return el; };
      host.append(caption("Contents · PDF and Word"), row("export-toc", "Table of contents", null, checkBox("Table of contents", selected.contents.toc, v => update({ contents: { ...selected.contents, toc: v } }))),
        row("export-depth", "Contents depth", null, number("Contents depth", selected.contents.depth, 1, 3, v => update({ contents: { ...selected.contents, depth: v } }))),
        row("export-numbered", "Numbered sections", null, checkBox("Numbered sections", selected.contents.numbered, v => update({ contents: { ...selected.contents, numbered: v } }))));
    };
    const check = async (refresh: boolean) => { try { diagnostics = await deps.exportTools?.diagnostics(refresh) ?? null; } catch { diagnostics = { pandoc: { found: false, version: "", path: "" }, typst: { found: false, version: "", path: "" }, fonts: [] }; } draw(); };
    draw(); void check(false);
  },
};
