// Cells copied from a spreadsheet (Numbers, Excel, Google Sheets) or other
// tab-separated text become a Markdown table. Clipboard HTML is parsed into an
// inert document and only the cells' text is read.
import { findTable, serializeTable } from "./table";

function escapeCell(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim().replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function tableText(rows: string[][]): string | null {
  const columns = Math.max(...rows.map((row) => row.length));
  if (rows.length < 2 || columns < 2) return null;
  const cells = rows.map((row) => [...row.map(escapeCell), ...Array(columns - row.length).fill("")]);
  const lines = [cells[0], cells[0].map(() => "---"), ...cells.slice(1)].map((row) => `| ${row.join(" | ")} |`);
  const source = lines.join("\n");
  const table = findTable(source, 0);
  return table ? serializeTable(table, true).join("\n") : null;
}

/** Tab-separated lines with the same number of tabs on each line. */
export function tableFromTsv(text: string): string | null {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  if (lines.length < 2) return null;
  const rows = lines.map((line) => line.split("\t"));
  if (rows[0].length < 2 || rows.some((row) => row.length !== rows[0].length)) return null;
  return tableText(rows);
}

function cellText(cell: Element): string {
  for (const hidden of Array.from(cell.querySelectorAll("script, style, template, noscript"))) hidden.remove();
  for (const br of Array.from(cell.querySelectorAll("br"))) br.replaceWith("\n");
  for (const block of Array.from(cell.querySelectorAll("p, div"))) block.append("\n");
  return (cell.textContent ?? "").replace(/[ \t ]+/g, " ").replace(/ ?\n ?/g, "\n");
}

/** The first `<table>` in clipboard HTML. */
export function tableFromHtml(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const rows = Array.from(table.querySelectorAll("tr"))
    .filter((row) => row.closest("table") === table)
    .map((row) => Array.from(row.children).filter((cell) => cell.matches("td, th")).map(cellText));
  if (!rows.length || rows.some((row) => !row.length)) return null;
  return tableText(rows);
}

/** A Markdown table for clipboard contents, or null when it is not tabular. */
export function tableFromClipboard(html: string, text: string): string | null {
  return (html && tableFromHtml(html)) || tableFromTsv(text);
}
