// GFM tables in Markdown source: find the table around the cursor, move between
// cells, change rows, columns and alignment, and line the pipes up. Every edit
// is computed on the plain "\n"-separated source and returned as one change.
import { scanMarkdownLines } from "./markdown-blocks";
import { displayWidth } from "./text-width";

export type Align = "none" | "left" | "center" | "right";

type Row = {
  cells: string[];
  /** The source line, kept while the row is unchanged and formatting is off. */
  raw?: string;
};

export type Table = {
  /** 0-based line of the header row. */
  start: number;
  /** 0-based line after the last row. */
  end: number;
  /** Header first, then body rows; the delimiter row is `aligns`. */
  rows: Row[];
  aligns: Align[];
  delimiterRaw?: string;
};

export type TableCommand =
  | "next" | "prev" | "down"
  | "row_above" | "row_below" | "col_left" | "col_right"
  | "delete_row" | "delete_col"
  | "align_left" | "align_center" | "align_right" | "align_none"
  | "format" | "delete";

export type TableEdit = { from: number; to: number; insert: string; anchor: number; head: number };

export type TableContext = { row: number; column: number; columns: number; rows: number };

/** Offsets of the unescaped pipes in a line. */
function pipeOffsets(line: string): number[] {
  const pipes: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "|") pipes.push(i);
  }
  return pipes;
}

/** Content ranges (trimmed, as offsets in `line`) of each cell. */
function cellRanges(line: string): { from: number; to: number }[] {
  const body = line.replace(/\r$/, "");
  const pipes = pipeOffsets(body);
  const lead = body.length - body.trimStart().length;
  const bounds = [...pipes];
  if (body.trimStart()[0] !== "|") bounds.unshift(lead - 1);
  const trailing = pipes.length && body.trimEnd().length - 1 === pipes[pipes.length - 1];
  if (!trailing) bounds.push(body.trimEnd().length);
  const ranges: { from: number; to: number }[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    let from = bounds[i] + 1;
    let to = bounds[i + 1];
    while (from < to && /\s/.test(body[from])) from++;
    while (to > from && /\s/.test(body[to - 1])) to--;
    // An empty cell puts the caret after "| ", where typing reads naturally.
    if (from === to) from = to = Math.min(bounds[i] + 2, bounds[i + 1]);
    ranges.push({ from, to });
  }
  return ranges;
}

export function splitCells(line: string): string[] {
  return cellRanges(line).map(({ from, to }) => line.slice(from, to));
}

function parseDelimiter(line: string): Align[] | null {
  if (!line.includes("-")) return null;
  const cells = splitCells(line);
  if (!cells.length || !cells.every((cell) => /^:?-+:?$/.test(cell))) return null;
  return cells.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":") && cell.length > 1;
    return left && right ? "center" : right ? "right" : left ? "left" : "none";
  });
}

/** The table that contains 0-based `lineIndex`, if any. */
export function findTable(source: string, lineIndex: number): Table | null {
  const lines = source.split("\n");
  const scanned = scanMarkdownLines(source);
  const rowLike = (i: number): boolean =>
    i >= 0 && i < lines.length && !scanned[i].code && scanned[i].text === lines[i]
    && lines[i].trim() !== "" && pipeOffsets(lines[i]).length > 0;
  if (!rowLike(lineIndex)) return null;
  let top = lineIndex;
  while (rowLike(top - 1)) top--;
  for (let header = lineIndex; header >= top; header--) {
    const aligns = header + 1 < lines.length && rowLike(header + 1) ? parseDelimiter(lines[header + 1]) : null;
    if (!aligns || splitCells(lines[header]).length !== aligns.length) continue;
    let end = header + 2;
    while (rowLike(end)) end++;
    if (lineIndex >= end) return null;
    const rows = [header, ...Array.from({ length: end - header - 2 }, (_, i) => header + 2 + i)]
      .map((i) => ({ cells: splitCells(lines[i]), raw: lines[i] }));
    return { start: header, end, rows, aligns, delimiterRaw: lines[header + 1] };
  }
  return null;
}

function rowLine(table: Table, row: number): number {
  return table.start + (row === 0 ? 0 : row + 1);
}

function padCell(text: string, width: number, align: Align): string {
  const space = Math.max(0, width - displayWidth(text));
  if (align === "right") return " ".repeat(space) + text;
  if (align === "center") return " ".repeat(Math.floor(space / 2)) + text + " ".repeat(Math.ceil(space / 2));
  return text + " ".repeat(space);
}

function delimiterCell(align: Align, width: number): string {
  if (align === "left") return ":" + "-".repeat(width - 1);
  if (align === "right") return "-".repeat(width - 1) + ":";
  if (align === "center") return ":" + "-".repeat(width - 2) + ":";
  return "-".repeat(width);
}

/** Source lines for the table; `format` lines the pipes up. */
export function serializeTable(table: Table, format: boolean): string[] {
  const columns = table.aligns.length;
  const cellsOf = (row: Row): string[] => [...row.cells, ...Array(Math.max(0, columns - row.cells.length)).fill("")];
  if (!format) {
    const compact = (cells: string[]): string => `| ${cells.join(" | ")} |`;
    const lines = table.rows.map((row) => row.raw ?? compact(cellsOf(row)));
    const delimiter = table.delimiterRaw ?? compact(table.aligns.map((align) => delimiterCell(align, 3)));
    return [lines[0], delimiter, ...lines.slice(1)];
  }
  const widths: number[] = [];
  for (const row of table.rows) {
    cellsOf(row).forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? (i < columns ? 3 : 1), displayWidth(cell));
    });
  }
  const line = (cells: string[]): string =>
    `| ${cells.map((cell, i) => padCell(cell, widths[i], table.aligns[i] ?? "none")).join(" | ")} |`;
  const lines = table.rows.map((row) => line(cellsOf(row)));
  const delimiter = `| ${table.aligns.map((align, i) => delimiterCell(align, widths[i])).join(" | ")} |`;
  return [lines[0], delimiter, ...lines.slice(1)];
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
  return starts;
}

/** Row and column of the cell holding `offset` (the delimiter row counts as the header). */
function cellAt(table: Table, line: string, lineIndex: number, column: number): { row: number; column: number } {
  const row = lineIndex <= table.start + 1 ? 0 : lineIndex - table.start - 1;
  const pipes = pipeOffsets(line).filter((pipe) => pipe < column).length;
  const leading = line.trimStart().startsWith("|") ? 1 : 0;
  const cell = Math.min(Math.max(pipes - leading, 0), table.aligns.length - 1);
  return { row, column: cell };
}

export function tableContext(source: string, offset: number): TableContext | null {
  const starts = lineStarts(source);
  let lineIndex = starts.length - 1;
  while (starts[lineIndex] > offset) lineIndex--;
  const table = findTable(source, lineIndex);
  if (!table) return null;
  const line = source.split("\n")[lineIndex];
  const at = cellAt(table, line, lineIndex, offset - starts[lineIndex]);
  return { ...at, columns: table.aligns.length, rows: table.rows.length };
}

function changed(table: Table): void {
  for (const row of table.rows) row.raw = undefined;
  table.delimiterRaw = undefined;
}

/**
 * Applies `command` to the table around `offset`. Returns the replacement for
 * the table's lines and the new selection, or null when the cursor is not in a
 * table or the command does not apply there.
 */
export function tableEdit(source: string, offset: number, command: TableCommand, format: boolean): TableEdit | null {
  const starts = lineStarts(source);
  let lineIndex = starts.length - 1;
  while (starts[lineIndex] > offset) lineIndex--;
  const table = findTable(source, lineIndex);
  if (!table) return null;
  const lines = source.split("\n");
  let { row, column } = cellAt(table, lines[lineIndex], lineIndex, offset - starts[lineIndex]);
  const columns = table.aligns.length;
  const emptyRow = (): Row => ({ cells: Array(columns).fill("") });
  let select = true;
  let exitTable = false;
  let reformat = format;

  switch (command) {
    case "next":
      if (column + 1 < columns) column++;
      else {
        if (row === table.rows.length - 1) table.rows.push(emptyRow());
        row++;
        column = 0;
      }
      break;
    case "prev":
      if (column > 0) column--;
      else if (row > 0) {
        row--;
        column = columns - 1;
      }
      break;
    case "down":
      if (row === table.rows.length - 1) {
        if (row > 0 && table.rows[row].cells.every((cell) => cell === "")) {
          table.rows.pop();
          exitTable = true;
        } else table.rows.push(emptyRow());
      }
      if (!exitTable) row++;
      break;
    case "row_above":
      if (row === 0) return null;
      table.rows.splice(row, 0, emptyRow());
      select = false;
      break;
    case "row_below":
      table.rows.splice(row + 1, 0, emptyRow());
      row++;
      select = false;
      break;
    case "col_left":
    case "col_right": {
      const at = command === "col_left" ? column : column + 1;
      for (const r of table.rows) {
        while (r.cells.length < at) r.cells.push("");
        r.cells.splice(at, 0, "");
      }
      table.aligns.splice(at, 0, "none");
      changed(table);
      column = at;
      select = false;
      break;
    }
    case "delete_row":
      if (row === 0) return null;
      table.rows.splice(row, 1);
      row = Math.min(row, table.rows.length - 1);
      select = false;
      break;
    case "delete_col":
      if (columns === 1) return null;
      for (const r of table.rows) if (r.cells.length > column) r.cells.splice(column, 1);
      table.aligns.splice(column, 1);
      changed(table);
      column = Math.min(column, columns - 2);
      select = false;
      break;
    case "align_left":
    case "align_center":
    case "align_right":
    case "align_none":
      table.aligns[column] = command.slice(6) as Align;
      table.delimiterRaw = undefined;
      select = false;
      break;
    case "format":
      reformat = true;
      select = false;
      break;
    case "delete": {
      const from = starts[table.start];
      const to = table.end < lines.length ? starts[table.end] : source.length;
      return { from, to, insert: "", anchor: from, head: from };
    }
  }

  const replacement = serializeTable(table, reformat);
  const from = starts[table.start];
  const to = starts[table.end - 1] + lines[table.end - 1].length;
  let insert = replacement.join("\n");
  if (exitTable) {
    // Enter on an empty last row leaves the table on a fresh line below it.
    const nextBlank = table.end < lines.length && lines[table.end].trim() === "";
    if (!nextBlank) insert += "\n";
    const anchor = from + insert.length + (nextBlank ? 1 : 0);
    return { from, to, insert, anchor, head: anchor };
  }
  const target = replacement[rowLine(table, row) - table.start];
  const range = cellRanges(target)[column] ?? { from: target.length, to: target.length };
  const base = from + replacement.slice(0, rowLine(table, row) - table.start).reduce((sum, l) => sum + l.length + 1, 0);
  return {
    from,
    to,
    insert,
    anchor: base + range.from,
    head: base + (select ? range.to : range.from),
  };
}
