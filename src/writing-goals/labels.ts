const format = (value: number) => value.toLocaleString("en-US");
export function goalText(words: number, goal: number, session: boolean): string {
  return `${session ? "Session " : ""}${format(words)} / ${format(goal)}`;
}
export function goalTitle(words: number, goal: number, session: boolean): string {
  const percent = Math.min(100, Math.round(words / goal * 100));
  const remaining = words >= goal ? "goal reached" : `${format(goal - words)} to go`;
  return `${format(words)} of ${format(goal)} words${session ? " this session" : ""} (${percent}%) · ${remaining}`;
}
export function reachedToast(goal: number, session: boolean): string {
  return `${session ? "Session" : "Note"} goal reached: ${format(goal)} words.`;
}
