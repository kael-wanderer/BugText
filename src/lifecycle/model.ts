// Document lifecycle (spec 4.1): status, superseded_by and review_by, read from a note's
// properties. Pure and small: the tab strip uses it at startup.

export type LifecycleStatus = "draft" | "current" | "superseded";
export type Lifecycle = { status: LifecycleStatus | null; supersededBy: string | null; reviewBy: string | null };

const STATUSES: readonly string[] = ["draft", "current", "superseded"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number): string => String(n).padStart(2, "0");

export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** YYYY-MM-DD when it names a real calendar day, else null. */
export function validDate(text: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? match[0] : null;
}

/** Link target of a superseded_by value: "a.md", "[A](a.md)" or "<a b.md>"; null when empty. */
export function supersedeTarget(value: string): string | null {
  let target = value.trim();
  const link = /^\[[^\]]*\]\((.*)\)$/.exec(target);
  if (link) target = link[1].trim();
  const angled = /^<(.*)>$/.exec(target);
  if (angled) target = angled[1].trim();
  return target || null;
}

export function lifecycleOf(props: Record<string, unknown> | null): Lifecycle {
  if (!props) return { status: null, supersededBy: null, reviewBy: null };
  const raw = typeof props.status === "string" ? props.status.trim().toLowerCase() : "";
  const status = STATUSES.includes(raw) ? (raw as LifecycleStatus) : null;
  const supersededBy = typeof props.superseded_by === "string" ? supersedeTarget(props.superseded_by) : null;
  const due = props.review_by;
  const reviewBy = due instanceof Date && !Number.isNaN(due.getTime()) ? localToday(due)
    : typeof due === "string" ? validDate(due) : null;
  return { status, supersededBy, reviewBy };
}

export function reviewDue(reviewBy: string | null, today: string): boolean {
  return reviewBy !== null && reviewBy < today;
}

/** "1 Nov", or "1 Nov 2026" when the year is not today's. Fixed English names: no locale. */
export function shortDate(iso: string, today: string): string {
  const [y, m, d] = iso.split("-");
  const text = `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}`;
  return y === today.slice(0, 4) ? text : `${text} ${y}`;
}
