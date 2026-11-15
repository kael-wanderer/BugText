// File ▸ Import: the web page, Word document and CSV flows. Every outside
// effect goes through `ImportDeps` (Rust commands, the editor) and every
// question through `ImportUI`, so the order of steps is tested here.

import type { IndexedNote } from "../links/index";
import { outputPath } from "../recipes/path";
import { cleanPage } from "./clean";
import { csvTable, parseCsv } from "./csv";
import { defaultSavePath, earlierImport, importedNote, nameFrom } from "./note";

export type ImportKind = "web" | "word" | "csv";
type Earlier = { path: string; importedAt: string | null };
type Answer = { savePath: string; address?: string; again: boolean } | { open: string } | null;

export type ImportUI = {
  ask: (args: { kind: ImportKind; address?: string; savePath: string; earlier: Earlier | null }) => Promise<Answer>;
  busy: (text: string) => void;
  result: (args: { path: string; problems: string[] }) => void;
  fail: (text: string) => void;
};

export type ImportDeps = {
  folder: () => string | null;
  activeRelative: () => string | null;
  imagesFolder: () => string;
  today: () => string;
  notes: () => IndexedNote[];
  pickFile: (kind: "word" | "csv") => Promise<string | null>;
  fetchPage: (address: string) => Promise<{ url: string; html: string; digest: string }>;
  htmlToMarkdown: (html: string) => Promise<string>;
  probe: (path: string, kind: "word" | "csv") => Promise<{ name: string; stem: string; bytes: number; digest: string }>;
  readCsv: (path: string) => Promise<string>;
  copyOriginal: (args: { folder: string; relativeDir: string; imagesFolder: string; path: string; kind: "word" | "csv" }) => Promise<{ link: string }>;
  word: (args: { folder: string; relativeDir: string; imagesFolder: string; path: string }) => Promise<{ markdown: string; problems: string[] }>;
  create: (args: { folder: string; relativeDir: string; stem: string; contents: string }) => Promise<string>;
  created: (path: string, text: string) => void;
  open: (path: string) => void;
};

const NO_FOLDER = "Open a folder to import into.";
const NO_TEXT = "The page has no text to import.";
const FAILED = "The import did not finish.";
const TOO_LARGE = "The file is too large for a table.";
const FOLDER_CHANGED = "The folder changed. Nothing was imported into the new folder.";

type Target = { relativeDir: string; stem: string };

/** Fixed strings from Rust come back as rejections; anything else gets one generic line. */
function message(error: unknown): string {
  return typeof error === "string" && error.length > 0 && error.length < 300 ? error : FAILED;
}

function target(savePath: string): Target | { error: string } {
  const checked = outputPath(savePath.trim(), { now: new Date(), current: null });
  if ("error" in checked) return checked;
  const slash = checked.relative.lastIndexOf("/");
  return {
    relativeDir: slash < 0 ? "" : checked.relative.slice(0, slash),
    stem: checked.relative.slice(slash + 1).replace(/\.md$/i, ""),
  };
}

function withoutFragment(address: string): string {
  const hash = address.indexOf("#");
  return (hash < 0 ? address : address.slice(0, hash)).trim();
}

function linkText(text: string): string {
  return text.replace(/[\\[\]]/g, (c) => `\\${c}`).replace(/</g, "&lt;");
}

function linkTarget(link: string): string {
  return /[ ()]/.test(link) ? `<${link}>` : link;
}

function imagesLine(count: number): string[] {
  if (count === 0) return [];
  return [count === 1 ? "1 image stays linked to the web." : `${count} images stay linked to the web.`];
}

async function finish(
  deps: ImportDeps,
  ui: ImportUI,
  folder: string,
  where: Target,
  contents: string,
  problems: string[],
  copied?: string,
): Promise<void> {
  if (deps.folder() !== folder) return ui.fail(FOLDER_CHANGED);
  let path: string;
  try {
    path = await deps.create({ folder, relativeDir: where.relativeDir, stem: where.stem, contents });
  } catch (error) {
    ui.fail(copied ? `Could not create the note. The original was copied to ${copied}.` : message(error));
    return;
  }
  deps.created(path, contents);
  ui.result({ path, problems });
}

export async function importWeb(deps: ImportDeps, ui: ImportUI): Promise<void> {
  const folder = deps.folder();
  if (!folder) return ui.fail(NO_FOLDER);
  let answer = await ui.ask({ kind: "web", savePath: "", earlier: null });
  if (!answer || "open" in answer) return answer ? deps.open(answer.open) : undefined;
  let address = withoutFragment(answer.address ?? "");
  const typed = answer.address ?? "";
  let savePath = answer.savePath;
  let asked = false;
  const earlier = earlierImport(deps.notes(), folder, { source: address });
  if (earlier) {
    asked = true;
    answer = await ui.ask({ kind: "web", address: typed, savePath, earlier });
    if (!answer || "open" in answer) return answer ? deps.open(answer.open) : undefined;
    savePath = answer.savePath;
    if (answer.address !== undefined) address = withoutFragment(answer.address);
  }
  let where = savePath.trim() ? target(savePath) : null;
  if (where && "error" in where) return ui.fail(where.error);
  ui.busy("Fetching the page…");
  let page: { url: string; html: string; digest: string };
  try {
    page = await deps.fetchPage(answer.address ?? typed);
  } catch (error) {
    return ui.fail(message(error));
  }
  if (!asked) {
    const same = earlierImport(deps.notes(), folder, { digest: page.digest });
    if (same) {
      const again = await ui.ask({ kind: "web", address: typed, savePath, earlier: same });
      if (!again || "open" in again) return again ? deps.open(again.open) : undefined;
      if (again.savePath !== savePath) {
        savePath = again.savePath;
        where = savePath.trim() ? target(savePath) : null;
        if (where && "error" in where) return ui.fail(where.error);
      }
    }
  }
  const cleaned = cleanPage(page.html, page.url);
  ui.busy("Converting the page…");
  let markdown: string;
  try {
    markdown = await deps.htmlToMarkdown(cleaned.html);
  } catch (error) {
    return ui.fail(message(error));
  }
  if (!markdown.trim()) return ui.fail(NO_TEXT);
  if (!where) {
    where = target(defaultSavePath(deps.activeRelative(), nameFrom(cleaned.title)));
    if ("error" in where) return ui.fail(where.error);
  }
  const contents = importedNote(markdown.endsWith("\n") ? markdown : `${markdown}\n`, {
    source: address,
    importedAt: deps.today(),
    digest: page.digest,
    ...(cleaned.title ? { title: cleaned.title } : {}),
  });
  await finish(deps, ui, folder, where, contents, imagesLine(cleaned.webImages));
}

async function csvBody(deps: ImportDeps, path: string, name: string, link: string): Promise<string> {
  const original = `[${linkText(name)}](${linkTarget(link)})`;
  let text: string;
  try {
    text = await deps.readCsv(path);
  } catch (error) {
    if (error === "too-large") return `${original}\n\n${TOO_LARGE}\n`;
    throw error;
  }
  const table = csvTable(parseCsv(text));
  if ("tooLarge" in table) return `${original}\n\n${table.rows} rows, ${table.columns} columns. ${TOO_LARGE}\n`;
  return `${table.markdown}\nOriginal: ${original}\n`;
}

export async function importFile(kind: "word" | "csv", deps: ImportDeps, ui: ImportUI): Promise<void> {
  const folder = deps.folder();
  if (!folder) return ui.fail(NO_FOLDER);
  const path = await deps.pickFile(kind);
  if (!path) return;
  let probe: Awaited<ReturnType<ImportDeps["probe"]>>;
  try {
    probe = await deps.probe(path, kind);
  } catch (error) {
    return ui.fail(message(error));
  }
  const earlier = earlierImport(deps.notes(), folder, { digest: probe.digest });
  const answer = await ui.ask({ kind, savePath: defaultSavePath(deps.activeRelative(), nameFrom(probe.stem)), earlier });
  if (!answer || "open" in answer) return answer ? deps.open(answer.open) : undefined;
  const where = target(answer.savePath.trim() || defaultSavePath(deps.activeRelative(), nameFrom(probe.stem)));
  if ("error" in where) return ui.fail(where.error);
  const imagesFolder = deps.imagesFolder();
  ui.busy(kind === "word" ? "Converting the document…" : "Reading the file…");
  let link: string;
  let body: string;
  let problems: string[] = [];
  try {
    ({ link } = await deps.copyOriginal({ folder, relativeDir: where.relativeDir, imagesFolder, path, kind }));
  } catch (error) {
    return ui.fail(message(error));
  }
  try {
    if (kind === "word") {
      const converted = await deps.word({ folder, relativeDir: where.relativeDir, imagesFolder, path });
      body = converted.markdown.endsWith("\n") ? converted.markdown : `${converted.markdown}\n`;
      problems = converted.problems;
    } else {
      body = await csvBody(deps, path, probe.name, link);
    }
  } catch (error) {
    return ui.fail(message(error));
  }
  const contents = importedNote(body, { source: link, importedAt: deps.today(), digest: probe.digest });
  await finish(deps, ui, folder, where, contents, problems, link);
}
