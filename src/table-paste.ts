import { formatTable } from "./table";

export function tableFromTsv(text: string): string | null {
  const rows = text.replace(/\r/g, "").split("\n").filter((row, i, all) => row.length || i < all.length - 1).map((row) => row.split("\t"));
  if (rows.length < 2 || rows.some((row) => row.length !== rows[0].length)) return null;
  return formatTable(rows.map((row) => row.map(escapeCell)));
}
export function tableFromHtml(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const rows = Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => escapeCell(cell.textContent ?? "")));
  if (rows.length < 2 || !rows[0].length) return null;
  return formatTable(rows);
}
export function escapeCell(value: string): string { return value.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|").trim(); }
