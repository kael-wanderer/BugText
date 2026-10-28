import { describe, expect, it } from "vitest";
import { fillTemplate, formatDate, parseHeader, placeholderValues } from "../templates/placeholders";

const NOW = new Date(2026, 9, 28, 14, 5);
const values = (title = "Weekly sync") => placeholderValues(NOW, title, "YYYY-MM-DD");

describe("formatDate", () => {
  it("supports the three formats", () => {
    expect(formatDate(NOW, "YYYY-MM-DD")).toBe("2026-10-28");
    expect(formatDate(NOW, "DD-MM-YYYY")).toBe("28-10-2026");
    expect(formatDate(NOW, "MM/DD/YYYY")).toBe("10/28/2026");
  });
});

describe("placeholderValues", () => {
  it("fills every key", () => {
    const v = values();
    expect(v).toMatchObject({ title: "Weekly sync", date: "2026-10-28", time: "14:05", year: "2026", month: "10", day: "28" });
    expect(v.weekday).toBe(NOW.toLocaleDateString(undefined, { weekday: "long" }));
  });
});

describe("fillTemplate", () => {
  it("replaces all known keys", () => {
    const out = fillTemplate("{{title}}|{{date}}|{{time}}|{{year}}/{{month}}/{{day}}|{{weekday}}", values());
    expect(out.text).toBe(`Weekly sync|2026-10-28|14:05|2026/10/28|${values().weekday}`);
  });
  it("keeps unknown placeholders", () => {
    expect(fillTemplate("{{nope}} {{ title }} {{__proto__}}", values()).text).toBe("{{nope}} {{ title }} {{__proto__}}");
  });
  it("removes the first cursor and reports its offset", () => {
    const out = fillTemplate("# {{title}}\n{{cursor}}\nend {{cursor}}", values("Hi"));
    expect(out.text).toBe("# Hi\n\nend {{cursor}}");
    expect(out.cursor).toBe(5);
  });
  it("puts the cursor at the end without a marker", () => {
    expect(fillTemplate("abc", values()).cursor).toBe(3);
  });
  it("inserts titles literally", () => {
    const out = fillTemplate("{{title}} {{date}}", values("{{date}} <b>"));
    expect(out.text).toBe("{{date}} <b> 2026-10-28");
  });
});

describe("parseHeader", () => {
  it("reads folder and name and strips the header", () => {
    const h = parseHeader("<!-- template\nfolder: meetings\nname: {{date}} {{title}}\n-->\n# {{title}}\n");
    expect(h).toEqual({ folder: "meetings", name: "{{date}} {{title}}", body: "# {{title}}\n" });
  });
  it("ignores unknown keys", () => {
    const h = parseHeader("<!-- template\ncolor: red\nfolder: a\n-->\nx");
    expect(h.folder).toBe("a");
    expect(h.name).toBeUndefined();
    expect(h.body).toBe("x");
  });
  it("treats a later or plain comment as text", () => {
    const later = "intro\n<!-- template\nfolder: a\n-->\n";
    expect(parseHeader(later)).toEqual({ body: later });
    expect(parseHeader("<!-- note -->\nx")).toEqual({ body: "<!-- note -->\nx" });
  });
  it("handles CRLF", () => {
    expect(parseHeader("<!-- template\r\nfolder: a\r\n-->\r\nbody").body).toBe("body");
  });
});
