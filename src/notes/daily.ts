import { formatDate } from "../templates/placeholders";

/** Folder inside the open folder that holds one note per day. */
export const DAILY_FOLDER = "Daily";

export type DailyNotePlan = { path: string; dir: string; stem: string; contents: string };

/** Path and starter text for the daily note of `now`, inside the open folder. */
export function dailyNotePlan(folder: string, now: Date): DailyNotePlan {
  const root = folder.replace(/\/+$/, "");
  if (!root) throw new Error("Open a folder to use the daily note.");
  const stem = formatDate(now, "YYYY-MM-DD");
  return {
    path: `${root}/${DAILY_FOLDER}/${stem}.md`,
    dir: DAILY_FOLDER,
    stem,
    contents: `---\ndate: ${stem}\n---\n\n# ${stem}\n\n`,
  };
}
