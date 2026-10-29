import { setProperty } from "../properties/edit";
import { readProperties } from "../properties/parse";
import { formatDate } from "../templates/placeholders";

export type PresetField = { key: string; kind: "text" | "list" | "date" | "number" | "checkbox"; value: string | number | boolean | string[] };
export type NoteType = { id: string; name: string; template: string; fields: PresetField[] };
export const DEFAULT_NOTE_TYPES: NoteType[] = [
  { id: "meeting", name: "Meeting", template: "", fields: [{ key: "date", kind: "date", value: "{{date}}" }, { key: "participants", kind: "list", value: [] }, { key: "tags", kind: "list", value: [] }] },
  { id: "project", name: "Project", template: "", fields: [{ key: "status", kind: "text", value: "planned" }, { key: "category", kind: "text", value: "" }, { key: "tags", kind: "list", value: [] }] },
  { id: "reading", name: "Reading", template: "", fields: [{ key: "source", kind: "text", value: "" }, { key: "status", kind: "text", value: "to-read" }, { key: "tags", kind: "list", value: [] }] },
];
export function validNoteType(value: unknown): value is NoteType {
  if (!value || typeof value !== "object") return false;
  const p = value as NoteType;
  return typeof p.id === "string" && !!p.id && p.id.length <= 120 && typeof p.name === "string" && !!p.name.trim() && p.name.length <= 120 && typeof p.template === "string" && p.template.length <= 120 && !/[\\/]/.test(p.template) && Array.isArray(p.fields) && p.fields.length <= 20 && new Set(p.fields.map(f => f?.key)).size === p.fields.length && p.fields.every(f => {
    if (!f || typeof f.key !== "string" || !f.key.trim() || f.key !== f.key.trim() || /[\r\n]/.test(f.key) || f.key.startsWith(":")) return false;
    return f.kind === "list" ? Array.isArray(f.value) && f.value.every(v => typeof v === "string") : f.kind === "number" ? typeof f.value === "number" && Number.isFinite(f.value) : f.kind === "checkbox" ? typeof f.value === "boolean" : (f.kind === "text" || f.kind === "date") && typeof f.value === "string";
  });
}
export function presetValues(preset: NoteType, now: Date): Record<string, PresetField["value"]> {
  return Object.fromEntries(preset.fields.map(f => [f.key, f.kind === "date" && f.value === "{{date}}" ? formatDate(now, "YYYY-MM-DD") : f.value]));
}
export function applyPreset(source: string, values: Record<string, PresetField["value"]>, missingOnly = true): { text: string; added: string[] } {
  const props = readProperties(source);
  if (props && !props.ok) throw new Error("Properties could not be read. Fix the YAML source before applying a note type.");
  const added: string[] = []; let text = source;
  for (const [key, value] of Object.entries(values)) {
    if (missingOnly && props?.ok && Object.prototype.hasOwnProperty.call(props.props, key)) continue;
    const edit = setProperty(text, key, value);
    if (!edit) throw new Error(`Cannot safely change ${key}. Edit this property in the source.`);
    text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to); added.push(key);
  }
  return { text, added };
}
export function defaultTypeBody(id: string): string {
  if (id === "meeting") return "# {{title}}\n\n## Agenda\n\n## Notes\n\n## Actions\n\n- [ ] \n";
  if (id === "project") return "# {{title}}\n\n## Goal\n\n## Next steps\n\n- [ ] \n\n## References\n";
  return "# {{title}}\n\n## Summary\n\n## Quotes\n\n## Questions\n";
}
