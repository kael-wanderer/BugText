// Turns a template plus a title into the note to create: where it goes, its text
// and where the cursor lands. Pure, so the picker preview and Quick Note share it.

import { relativeDestination, type Destination } from "./naming";
import { fillTemplate, parseHeader, placeholderValues, type DateFormat } from "./placeholders";

export type NotePlan = { destination: Destination; text: string; cursor: number };

export type PlanOptions = {
  title: string;
  now: Date;
  format: DateFormat;
  /** Settings ▸ Default folder for new notes, used when the header names none. */
  defaultFolder: string;
  /** Explorer folder (relative to the open folder); wins over the header. */
  targetDir?: string | null;
  /** File name template when the header has no `name:`; defaults to the title. */
  defaultName?: string;
};

export function planNote(raw: string, options: PlanOptions): NotePlan {
  const header = parseHeader(raw);
  const values = placeholderValues(options.now, options.title, options.format);
  const fill = (value: string): string => fillTemplate(value, values).text;
  const folder = options.targetDir ?? fill(header.folder ?? options.defaultFolder);
  const destination = relativeDestination(folder, fill(header.name ?? options.defaultName ?? "{{title}}"));
  const body = fillTemplate(header.body, values);
  return { destination, text: body.text, cursor: body.cursor };
}
