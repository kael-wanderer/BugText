// Task due dates (spec 4.3): `due:YYYY-MM-DD` or `📅 YYYY-MM-DD` on a task line, and the
// day group Tasks in Folder and Project Overview show it under.
import { validDate } from "../lifecycle/model";

export type DueGroup = "overdue" | "today" | "week" | "later" | "none";
export const DUE_LABELS: Record<DueGroup, string> = { overdue: "Overdue", today: "Today", week: "This week", later: "Later", none: "No date" };

/** First real date written as due:… or 📅 …; null when there is none. */
export function taskDue(text: string): string | null {
  for (const match of text.matchAll(/(?:(?<![\w-])due:|📅\s*)(\d{4}-\d{2}-\d{2})/gu)) {
    const date = validDate(match[1]);
    if (date) return date;
  }
  return null;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "This week" is tomorrow through seven days from today. */
export function dueGroup(due: string | null, today: string): DueGroup {
  if (!due) return "none";
  if (due < today) return "overdue";
  if (due === today) return "today";
  return due <= addDays(today, 7) ? "week" : "later";
}
