// CSV import: RFC 4180 parsing (comma separated, quoted fields) and a Markdown
// pipe table. Cells never carry raw HTML or a stray pipe into the note.

export const MAX_TABLE_ROWS = 500;
export const MAX_TABLE_COLUMNS = 50;

/** Rows of fields. A leading BOM is dropped; blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;
  const source = text.startsWith("\ufeff") ? text.slice(1) : text;
  const endRow = () => {
    row.push(field);
    if (!(row.length === 1 && row[0] === "" && !started)) rows.push(row);
    row = [];
    field = "";
    started = false;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      quoted = true;
      started = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
      started = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else {
      field += c;
      started = true;
    }
  }
  if (started || field !== "" || row.length > 0) endRow();
  return rows;
}

function cell(text: string): string {
  return text.replace(/\r\n|\r|\n/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/</g, "&lt;").trim();
}

export function csvTable(rows: string[][]): { markdown: string } | { tooLarge: true; rows: number; columns: number } {
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const dataRows = Math.max(rows.length - 1, 0);
  if (dataRows > MAX_TABLE_ROWS || columns > MAX_TABLE_COLUMNS) return { tooLarge: true, rows: dataRows, columns };
  if (rows.length === 0) return { markdown: "" };
  const line = (cells: string[]) => `| ${cells.join(" | ")} |\n`;
  const pad = (row: string[]) => Array.from({ length: columns }, (_, i) => cell(row[i] ?? ""));
  const header = pad(rows[0]).map((text, i) => text || `Column ${i + 1}`);
  const divider = line(Array.from({ length: columns }, () => "---"));
  return { markdown: line(header) + divider + rows.slice(1).map((row) => line(pad(row))).join("") };
}
