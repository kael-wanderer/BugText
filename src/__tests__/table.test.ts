import { describe, expect, it } from "vitest";
import { findTable, serializeTable, splitCells, tableContext, tableEdit, type TableCommand } from "../table";

const TABLE = ["| Item | Owner | Cost |", "| :-- | --- | --: |", "| Design | Lan | 120 |", "| Checks | Minh | 80 |"].join("\n");

/** Applies a command with the cursor at `marker` in `source` (the marker is removed). */
function run(source: string, command: TableCommand, format = true, marker = "‸") {
  const offset = source.indexOf(marker);
  const text = source.replace(marker, "");
  const edit = tableEdit(text, offset, command, format);
  if (!edit) return null;
  const result = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  return { text: result, selected: result.slice(Math.min(edit.anchor, edit.head), Math.max(edit.anchor, edit.head)), edit };
}

describe("splitCells", () => {
  it("splits on unescaped pipes and keeps escaped ones", () => {
    expect(splitCells("| a \\| b | c |")).toEqual(["a \\| b", "c"]);
    expect(splitCells("a | b")).toEqual(["a", "b"]);
    expect(splitCells("|  | x |")).toEqual(["", "x"]);
  });
});

describe("findTable", () => {
  it("finds the table from any of its lines", () => {
    for (let line = 0; line < 4; line++) expect(findTable(TABLE, line)?.start).toBe(0);
    expect(findTable(TABLE, 0)?.aligns).toEqual(["left", "none", "right"]);
  });

  it("accepts one-dash delimiters", () => {
    expect(findTable("|a|b|\n|-|-|\n|1|2|", 2)?.rows).toHaveLength(2);
  });

  it("ignores tables in code fences, mismatched headers and plain pipes", () => {
    expect(findTable("```\n| a | b |\n| - | - |\n```", 1)).toBeNull();
    expect(findTable("| a | b | c |\n| - | - |", 0)).toBeNull();
    expect(findTable("just a | pipe", 0)).toBeNull();
  });

  it("stops at the blank line after the table", () => {
    expect(findTable(`${TABLE}\n\n| x |`, 4)).toBeNull();
    expect(findTable(`intro\n\n${TABLE}`, 3)?.start).toBe(2);
  });
});

describe("serializeTable", () => {
  it("lines up pipes by display width and keeps alignment", () => {
    const lines = serializeTable(findTable("| Tên | Ghi |\n| :-: | --: |\n| Hà Nội | 東京 |\n| 🚀 | a |", 0)!, true);
    expect(lines).toEqual([
      "|  Tên   |  Ghi |",
      "| :----: | ---: |",
      "| Hà Nội | 東京 |",
      "|   🚀   |    a |",
    ]);
  });

  it("pads short rows and keeps extra cells", () => {
    const lines = serializeTable(findTable("| a | b |\n| - | - |\n| 1 |\n| 1 | 2 | 3 |", 0)!, true);
    expect(lines[2]).toBe("| 1   |     |");
    expect(lines[3]).toBe("| 1   | 2   | 3 |");
  });

  it("leaves untouched rows alone when formatting is off", () => {
    expect(serializeTable(findTable(TABLE, 0)!, false).join("\n")).toBe(TABLE);
  });
});

describe("tableEdit", () => {
  it("Tab moves to the next cell, selects it and formats", () => {
    const result = run(TABLE.replace("Design", "Des‸ign"), "next")!;
    expect(result.selected).toBe("Lan");
    expect(result.text.split("\n")[1]).toBe("| :----- | ----- | ---: |");
  });

  it("Tab in the last cell adds a row", () => {
    const result = run(TABLE.replace("80", "8‸0"), "next")!;
    expect(result.text.split("\n")).toHaveLength(5);
    expect(result.text.split("\n")[4]).toBe("|        |       |      |");
    expect(result.edit.anchor).toBe(result.text.lastIndexOf("\n") + 3);
  });

  it("Shift-Tab goes back, wrapping to the previous row", () => {
    expect(run(TABLE.replace("Checks", "‸Checks"), "prev")!.selected).toBe("120");
    expect(run(TABLE.replace("Item", "‸Item"), "prev")!.selected).toBe("Item");
  });

  it("Enter moves down, adds a row at the end, and leaves on an empty last row", () => {
    expect(run(TABLE.replace("Lan", "L‸an"), "down")!.selected).toBe("Minh");
    const added = run(TABLE.replace("Minh", "M‸inh"), "down", false)!;
    expect(added.text).toBe(`${TABLE}\n|  |  |  |`);
    const left = run(`${TABLE}\n| ‸ |  |  |\nafter`, "down", false)!;
    expect(left.text).toBe(`${TABLE}\n\nafter`);
    expect(left.edit.anchor).toBe(TABLE.length + 1);
  });

  it("inserts and deletes rows and columns", () => {
    expect(run(TABLE.replace("Lan", "L‸an"), "row_above", false)!.text.split("\n")[2]).toBe("|  |  |  |");
    expect(run(TABLE.replace("Item", "‸Item"), "row_above")).toBeNull();
    expect(run(TABLE.replace("Item", "‸Item"), "row_below", false)!.text.split("\n")[2]).toBe("|  |  |  |");
    const left = run(TABLE.replace("Owner", "Ow‸ner"), "col_left", false)!;
    expect(left.text.split("\n")[0]).toBe("| Item |  | Owner | Cost |");
    expect(left.text.split("\n")[1]).toBe("| :-- | --- | --- | --: |");
    const right = run(TABLE.replace("Owner", "Ow‸ner"), "col_right", false)!;
    expect(right.text.split("\n")[2]).toBe("| Design | Lan |  | 120 |");
    expect(run(TABLE.replace("Lan", "L‸an"), "delete_row", false)!.text).toBe(TABLE.split("\n").filter((l) => !l.includes("Lan")).join("\n"));
    expect(run(TABLE.replace("Item", "‸Item"), "delete_row")).toBeNull();
    expect(run(TABLE.replace("Owner", "Ow‸ner"), "delete_col", false)!.text.split("\n")[0]).toBe("| Item | Cost |");
    expect(run("| a |\n| - |\n| ‸1 |", "delete_col")).toBeNull();
  });

  it("aligns a column and keeps escaped pipes and Unicode", () => {
    const result = run("| Lệnh | Ý nghĩa |\n| - | - |\n| a \\| b | ‸ống |", "align_center")!;
    expect(result.text.split("\n")).toEqual([
      "| Lệnh   | Ý nghĩa |",
      "| ------ | :-----: |",
      "| a \\| b |   ống   |",
    ]);
  });

  it("deletes the whole table", () => {
    expect(run(`before\n${TABLE.replace("Lan", "L‸an")}\nafter`, "delete")!.text).toBe("before\nafter");
  });

  it("does nothing outside a table or inside a fence", () => {
    expect(run("plain ‸text", "next")).toBeNull();
    expect(run("```\n| a | b |\n| - | - |\n| ‸1 | 2 |\n```", "next")).toBeNull();
  });
});

describe("tableContext", () => {
  it("reports the cell and table size", () => {
    const offset = TABLE.indexOf("Minh");
    expect(tableContext(TABLE, offset)).toEqual({ row: 2, column: 1, columns: 3, rows: 3 });
    expect(tableContext("nothing", 2)).toBeNull();
  });
});
