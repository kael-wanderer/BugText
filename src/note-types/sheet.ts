import type { OrganizeHost } from "../notes/actions";
import { organizeSheet, node, field, action } from "../notes/sheet";
import { createWorkflowStore } from "../saved-views/store";
import { DEFAULT_NOTE_TYPES, validNoteType, presetValues, applyPreset, defaultTypeBody, singleChange, type NoteType, type PresetField } from "./model";
import { listTemplates, readTemplate, createFromTemplate, type TemplateInfo } from "../templates/library";
import { planNote } from "../templates/plan";
import { manualSnapshot } from "../recovery";

export async function showNoteTypeSheet(host: OrganizeHost, apply: boolean) {
  const binding = apply ? host.getSource() : null;
  if (apply && (!binding || !binding.path || !/\.(md|markdown)$/i.test(binding.path))) return;
  const folderAtOpen = host.getFolder();
  const sheet = organizeSheet(host.host(), apply ? "Apply note type" : "New typed note");
  const store = createWorkflowStore<NoteType>("note-types", validNoteType); sheet.cleanup(() => store.dispose());
  const error = node("p"); error.className = "organize-error"; error.setAttribute("role", "alert");
  const types = node("select"); const title = node("input");
  const template = node("select"); template.append(Object.assign(node("option", "Built-in starter"), { value: "" }));
  const fields = node("div"), preview = node("pre"), buttons = node("div"); buttons.className = "organize-actions";
  const submit = action(apply ? "Apply missing fields" : "Create", () => void run()); submit.disabled = true;
  let presets: NoteType[] = [], selected: NoteType | null = null, infos: TemplateInfo[] = [], raw = "", busy = false, generation = 0, templateReady = false;
  let values: Record<string, PresetField["value"]> = {};
  const now = new Date();
  const current = () => {
    if (!selected) throw new Error("Choose a note type.");
    if (!apply && !templateReady) throw new Error("Waiting for the selected template.");
    if (apply) return applyPreset(binding!.text, values, true);
    if (!title.value.trim()) throw new Error("Enter a title.");
    const plan = planNote(raw, { title: title.value, now, format: host.getTemplates().dateFormat, defaultFolder: host.getTemplates().defaultFolder });
    if ("error" in plan.destination) throw new Error(plan.destination.error);
    return { ...applyPreset(plan.text, values, false), destination: plan.destination };
  };
  const refresh = () => {
    if (sheet.closed) return;
    try {
      const result = current(); preview.textContent = apply ? `${result.added.length ? "Add missing fields: " + result.added.join(", ") : "No missing fields."}\n\n${result.text}` : result.text;
      error.textContent = store.error ?? ""; submit.disabled = busy || !!store.error || (apply && result.added.length === 0) || (!apply && !folderAtOpen);
    } catch (e) { error.textContent = (e as Error).message; submit.disabled = true; }
  };
  const renderFields = () => {
    fields.replaceChildren(); if (!selected) return;
    for (const f of selected.fields) {
      const input = node("input"); input.dataset.property = f.key;
      input.type = f.kind === "checkbox" ? "checkbox" : f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text";
      if (f.kind === "checkbox") input.checked = Boolean(values[f.key]); else input.value = Array.isArray(values[f.key]) ? (values[f.key] as string[]).join(", ") : String(values[f.key] ?? "");
      input.addEventListener("input", () => {
        values[f.key] = f.kind === "checkbox" ? input.checked : f.kind === "number" ? Number(input.value) : f.kind === "list" ? input.value.split(",").map(s => s.trim()).filter(Boolean) : input.value;
        refresh();
      });
      fields.append(field(f.kind === "list" ? `${f.key} (comma-separated)` : f.key, input));
    }
  };
  const loadTemplate = async () => {
    const request = ++generation; templateReady = false; submit.disabled = true;
    try {
      if (!selected) return;
      const info = infos.find(info => info.path.split(/[\\/]/).pop() === template.value);
      if (template.value && !info) throw new Error("Template missing. Choose another template or the built-in starter.");
      const contents = info ? await readTemplate(info.path) : defaultTypeBody(selected.id);
      if (request !== generation || sheet.closed) return;
      raw = contents; templateReady = true; refresh();
    } catch (e) { if (request === generation && !sheet.closed) { raw = ""; error.textContent = e instanceof Error ? e.message : "Could not read template."; submit.disabled = true; } }
  };
  const select = () => {
    selected = presets.find(p => p.id === types.value) ?? null;
    if (!selected) return;
    values = presetValues(selected, now); template.value = selected.template;
    if (selected.template && ![...template.options].some(o => o.value === selected!.template)) template.append(Object.assign(node("option", `Missing: ${selected.template}`), { value: selected.template }));
    template.value = selected.template; renderFields(); void loadTemplate();
  };
  async function run() {
    if (busy || submit.disabled) return; busy = true; refresh();
    try {
      if (host.getFolder() !== folderAtOpen) throw new Error("The folder changed. Reopen this action.");
      const result = current();
      if (apply) {
        await manualSnapshot(binding!.path!, binding!.text, "Before applying note type", true);
        if (sheet.closed) return;
        if (!host.apply(binding!, singleChange(binding!.text, result.text))) throw new Error("The source changed. Reopen Apply note type to review the current note.");
      } else {
        if (!folderAtOpen || !("destination" in result)) throw new Error("Open a folder before creating a typed note.");
        const path = await createFromTemplate({ folder: folderAtOpen, relativeDir: result.destination.dir, stem: result.destination.stem, contents: result.text });
        host.afterDiskWrite(path); await host.refreshExplorer().catch(() => {}); await host.openPath(path);
      }
      sheet.close();
    } catch (e) { error.textContent = e instanceof Error ? e.message : "Could not complete this action."; }
    finally { busy = false; submit.disabled = false; }
  }
  const saveDefaults = action("Save as defaults for this type", () => void (async () => {
    if (!selected || busy) return;
    const candidate: NoteType = { ...selected, template: template.value, fields: selected.fields.map(f => ({ ...f, value: f.kind === "date" ? "{{date}}" : values[f.key] })) };
    if (!validNoteType(candidate)) { error.textContent = "Invalid preset values."; return; }
    try { await store.update(items => (items.length ? items : DEFAULT_NOTE_TYPES).map(p => p.id === candidate.id ? candidate : p)); selected = candidate; presets = store.items; refresh(); }
    catch { error.textContent = store.error ?? "Could not save preset defaults. Try reopening this sheet."; }
  })());
  types.addEventListener("change", select); template.addEventListener("change", () => void loadTemplate()); title.addEventListener("input", refresh);
  sheet.body.append(field("Type", types));
  if (!apply) sheet.body.append(field("Title", title), field("Template", template));
  sheet.body.append(fields, node("p", apply ? "Review the complete result below. Existing fields and the note body are preserved; this is one undoable edit." : "Optional fields become ordinary YAML properties. Dates are filled once, at creation."), preview, error);
  buttons.append(action("Cancel", sheet.close), saveDefaults, submit); sheet.body.append(buttons);
  try {
    await store.reload(); infos = await listTemplates(host.getTemplates().folder);
    if (sheet.closed) return;
    presets = store.items.length ? store.items : DEFAULT_NOTE_TYPES;
    for (const preset of presets) types.append(Object.assign(node("option", preset.name), { value: preset.id }));
    for (const info of infos) template.append(Object.assign(node("option", info.name), { value: info.path.split(/[\\/]/).pop()! }));
    if (store.error) { error.textContent = store.error; return; }
    select(); if (!apply) title.focus(); else types.focus();
  } catch { if (!sheet.closed) error.textContent = "Could not load note types or templates. Close and try again."; }
}
