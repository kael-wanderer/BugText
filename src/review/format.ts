import type { ReviewRoute } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(ms: number): string {
  const date = new Date(ms);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function ago(then: number, now: number): string {
  const seconds = Math.max(0, now - then) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)} d ago`;
  return shortDate(then);
}

export function routeLabel(route: ReviewRoute): string {
  return route === "cli" ? "AI panel run" : route === "mcp" ? "MCP" : "Outside BugText";
}

export function counts(item: { added: number | null; removed: number | null }): string {
  return item.added === null || item.removed === null ? "" : `+${item.added} −${item.removed}`;
}
