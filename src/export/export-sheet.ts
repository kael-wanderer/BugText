import { fontAvailable } from "./checks";
import { lastPreset, presetSummary, presetsFor, type ExportFormat, type ExportPreset, type ExportSettings } from "./presets";

export type ToolDiagnostic = { found: boolean; version: string; path: string };
export type ExportDiagnostics = { pandoc: ToolDiagnostic; typst: ToolDiagnostic; fonts: string[] };
export type SheetResult = { action: "export" | "edit"; preset: ExportPreset; fonts: string[] } | null;
export type SheetOptions = {
  format: ExportFormat; settings: ExportSettings; missing: string[];
  diagnostics: (refresh: boolean) => Promise<ExportDiagnostics>; copy: (text: string) => Promise<void>;
};

export function showExportSheet(options: SheetOptions): Promise<SheetResult> {
  return new Promise(resolve => {
    const overlay = document.createElement("div"); overlay.className = "workspace-sheet-overlay";
    const form = document.createElement("form"); form.className = "workspace-sheet export-sheet"; form.setAttribute("role", "dialog"); form.setAttribute("aria-label", "Export");
    const title = document.createElement("h2"); title.textContent = `Export as ${options.format === "pdf" ? "PDF" : "Word"}`;
    const label = document.createElement("label"); label.textContent = "Preset";
    const select = document.createElement("select");
    const presets = presetsFor(options.settings);
    for (const preset of presets) { const item = document.createElement("option"); item.value = preset.id; item.textContent = preset.name; select.append(item); }
    select.value = lastPreset(options.settings, options.format).id; label.append(select);
    const summary = document.createElement("p"); summary.className = "export-sheet-summary";
    const checks = document.createElement("div"); checks.className = "export-sheet-checks"; checks.setAttribute("aria-live", "polite");
    const footer = document.createElement("div"); footer.className = "export-sheet-footer";
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit presets…";
    const again = document.createElement("button"); again.type = "button"; again.textContent = "Check again";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel";
    const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Export…"; submit.disabled = true;
    footer.append(edit, again, cancel, submit); form.append(title, label, summary);
    if (options.format === "docx") { const note = document.createElement("p"); note.textContent = "Page size, margins, font and page numbers apply to PDF only."; form.append(note); }
    form.append(checks, footer); overlay.append(form); document.body.append(overlay);
    let diagnostic: ExportDiagnostics | null = null;
    let showImages = false;
    let closed = false;
    const selected = () => presets.find(p => p.id === select.value) ?? presets[0];
    const finish = (result: SheetResult) => { if (closed) return; closed = true; overlay.remove(); resolve(result); };
    const row = (mark: string, message: string) => { const line = document.createElement("div"); line.className = "export-check"; const icon = document.createElement("span"); icon.textContent = mark; const text = document.createElement("span"); text.textContent = message; line.append(icon, text); checks.append(line); return line; };
    const render = () => {
      const preset = selected(); summary.textContent = presetSummary(preset); checks.replaceChildren();
      if (!diagnostic) { row("…", "Checking tools…"); submit.disabled = true; return; }
      const tool = (name: "pandoc" | "typst") => {
        const info = diagnostic![name]; const display = name === "pandoc" ? "Pandoc" : "Typst";
        if (info.found) row("✓", info.version || display);
        else { const command = `brew install ${name}`; const line = row("✕", `${display} is not installed. Install with ${command}`); const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "Copy"; copy.onclick = () => { void options.copy(command); }; line.append(copy); }
      };
      tool("pandoc"); if (options.format === "pdf") tool("typst");
      if (options.format === "pdf" && preset.id !== "standard" && !fontAvailable(preset.type.font, diagnostic.fonts)) row("!", `${preset.type.font} is not installed for Typst. Typst will use its default font.`);
      if (options.missing.length) {
        const count = options.missing.length; const line = row("!", `${count} image${count === 1 ? "" : "s"} could not be found`);
        const toggle = document.createElement("button"); toggle.type = "button"; toggle.textContent = showImages ? "Hide" : "Show"; toggle.onclick = () => { showImages = !showImages; render(); }; line.append(toggle);
        if (showImages) { const list = document.createElement("ul"); for (const path of options.missing) { const item = document.createElement("li"); item.textContent = path; list.append(item); } checks.append(list); }
      } else row("✓", "All images found");
      submit.disabled = !diagnostic.pandoc.found || (options.format === "pdf" && !diagnostic.typst.found);
    };
    const check = async (refresh: boolean) => { diagnostic = null; render(); try { diagnostic = await options.diagnostics(refresh); } catch { diagnostic = { pandoc: { found: false, version: "", path: "" }, typst: { found: false, version: "", path: "" }, fonts: [] }; } if (!closed) render(); };
    select.onchange = render; again.onclick = () => { void check(true); }; cancel.onclick = () => finish(null);
    edit.onclick = () => finish({ action: "edit", preset: selected(), fonts: diagnostic?.fonts ?? [] });
    form.onsubmit = event => { event.preventDefault(); if (!submit.disabled) finish({ action: "export", preset: selected(), fonts: diagnostic?.fonts ?? [] }); };
    overlay.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(null); } });
    void check(false); select.focus();
  });
}
