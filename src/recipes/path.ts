/** Output paths of recipes: placeholders and the inside-the-folder check. Pure. */

export type PathContext = { now: Date; current: string | null /* relative path of the current note */ };

const OUTSIDE = "The output path must be a Markdown note inside this folder.";
const NEEDS_CURRENT = "This recipe's output path uses the current note. Add Current note to its inputs.";

/** ISO 8601 week number and the year that week belongs to. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return { year, week };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function outputPath(pattern: string, ctx: PathContext): { relative: string } | { error: string } {
  const keys = [...pattern.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
  if ((keys.includes("title") || keys.includes("dir")) && ctx.current === null) return { error: NEEDS_CURRENT };
  const { now } = ctx;
  const week = isoWeek(now);
  const usesWeek = keys.includes("week");
  const current = ctx.current ?? "";
  const slash = current.lastIndexOf("/");
  const name = current.slice(slash + 1);
  const values: Record<string, string> = {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    year: String(usesWeek ? week.year : now.getFullYear()),
    month: pad(now.getMonth() + 1),
    day: pad(now.getDate()),
    week: pad(week.week),
    title: name.replace(/\.md$/i, ""),
    dir: slash < 0 ? "" : current.slice(0, slash),
  };
  // One pass: a value that itself holds `{{…}}` stays literal.
  let filled = pattern.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole);
  // An empty {{dir}} at the start leaves a leading slash: the note is at the root.
  if (pattern.startsWith("{{dir}}/") && values.dir === "") filled = filled.slice(1);
  if (filled.includes("\\")) return { error: OUTSIDE };
  const segments = filled.split("/");
  if (segments.some(s => s === "" || s === "." || s === "..")) return { error: OUTSIDE };
  const last = segments[segments.length - 1];
  if (/\.md$/i.test(last)) return { relative: filled };
  if (/\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(last)) return { error: OUTSIDE };
  return { relative: `${filled}.md` };
}
