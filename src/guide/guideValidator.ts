import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Checks a guide folder — `guide.json`, its pages, their links and images, and
 * every slug that a shipped build or the app itself depends on. The same rules
 * as the other Bug apps' guide checks, so kael.io.vn treats every guide alike.
 * Node only: it runs under Vitest, never in the app.
 */

/** One way the guide under `docs/guide/` can be wrong. */
export type GuideProblem =
  | { kind: "badSlug"; slug: string }
  | { kind: "duplicateSlug"; slug: string }
  | { kind: "missingFile"; slug: string }
  | { kind: "orphan"; slug: string }
  | { kind: "frontmatterMismatch"; slug: string }
  | { kind: "brokenLink"; page: string; target: string }
  | { kind: "missingImage"; page: string; path: string }
  | { kind: "forbiddenHTML"; page: string; snippet: string }
  | { kind: "deadAppLink"; slug: string }
  | { kind: "deadPublishedSlug"; slug: string }
  | { kind: "unsupportedVersion"; version: number };

interface ManifestPage {
  slug: string;
  title: string;
  summary: string;
}

interface Manifest {
  version: number;
  pages: ManifestPage[];
  redirects: Record<string, string>;
}

/** The slug is also the page's file path without `.md`: one folder, one name. */
const SLUG_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/;

export function validateGuide(root: string, appSlugs: readonly string[]): GuideProblem[] {
  const manifest = readManifest(root);
  if (manifest.version !== 1) return [{ kind: "unsupportedVersion", version: manifest.version }];

  const problems: GuideProblem[] = [];
  const pages = manifest.pages;
  const allSlugs = new Set(pages.map((page) => page.slug));
  const seen = new Set<string>();
  const listed = new Set<string>();
  const reportedDuplicates = new Set<string>();

  for (const page of pages) {
    if (!SLUG_PATTERN.test(page.slug)) {
      problems.push({ kind: "badSlug", slug: page.slug });
      continue;
    }
    if (seen.has(page.slug)) {
      if (!reportedDuplicates.has(page.slug)) {
        reportedDuplicates.add(page.slug);
        problems.push({ kind: "duplicateSlug", slug: page.slug });
      }
      continue;
    }
    seen.add(page.slug);
    listed.add(page.slug);
    const file = join(root, `${page.slug}.md`);
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      problems.push({ kind: "missingFile", slug: page.slug });
      continue;
    }
    problems.push(...checkPage(page, text, root, allSlugs));
  }

  problems.push(...orphans(root, listed));

  // A redirect keeps an old slug answering, so it counts as alive.
  const alive = new Set([...listed, ...Object.keys(manifest.redirects)]);
  for (const slug of appSlugs) {
    if (!alive.has(slug)) problems.push({ kind: "deadAppLink", slug });
  }
  const published = join(root, "published-slugs.txt");
  if (existsSync(published)) {
    for (const line of readFileSync(published, "utf8").split(/\r?\n|\r/)) {
      const slug = line.trim();
      if (slug !== "" && !alive.has(slug)) problems.push({ kind: "deadPublishedSlug", slug });
    }
  }
  return problems;
}

/** Throws when `guide.json` is missing, is not JSON, or has the wrong shape. */
function readManifest(root: string): Manifest {
  const raw: unknown = JSON.parse(readFileSync(join(root, "guide.json"), "utf8"));
  const fail = (why: string): never => {
    throw new Error(`guide.json: ${why}`);
  };
  if (!isRecord(raw)) return fail("not an object");
  if (typeof raw.version !== "number") return fail("version is not a number");
  if (!Array.isArray(raw.groups)) return fail("groups is not a list");
  const pages: ManifestPage[] = [];
  for (const group of raw.groups) {
    if (!isRecord(group) || typeof group.title !== "string" || !Array.isArray(group.pages)) {
      return fail("a group needs a title and pages");
    }
    for (const page of group.pages) {
      if (
        !isRecord(page) ||
        typeof page.slug !== "string" ||
        typeof page.title !== "string" ||
        typeof page.summary !== "string"
      ) {
        return fail("a page needs a slug, title and summary");
      }
      pages.push({ slug: page.slug, title: page.title, summary: page.summary });
    }
  }
  const redirects: Record<string, string> = {};
  if (raw.redirects !== undefined) {
    if (!isRecord(raw.redirects)) return fail("redirects is not an object");
    for (const [from, to] of Object.entries(raw.redirects)) {
      if (typeof to !== "string") return fail(`redirect ${from} does not name a slug`);
      redirects[from] = to;
    }
  }
  return { version: raw.version, pages, redirects };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkPage(page: ManifestPage, text: string, root: string, listed: Set<string>): GuideProblem[] {
  const problems: GuideProblem[] = [];
  const { front, body } = splitFrontmatter(text);
  if (front.get("title") !== page.title || front.get("summary") !== page.summary) {
    problems.push({ kind: "frontmatterMismatch", slug: page.slug });
  }

  const folder = page.slug.split("/").slice(0, -1);
  for (const target of captures(/(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g, body)) {
    if (!isRelative(target)) continue;
    const path = target.split("#")[0];
    if (!path.endsWith(".md")) continue;
    const resolved = resolve(path, folder);
    if (resolved === null || !listed.has(resolved.slice(0, -3))) {
      problems.push({ kind: "brokenLink", page: page.slug, target });
    }
  }
  for (const path of captures(/!\[[^\]]*\]\(([^)\s]+)\)/g, body)) {
    if (!isRelative(path)) continue;
    const clean = path.split("#")[0];
    const resolved = resolve(clean, folder);
    if (resolved === null || !existsSync(join(root, resolved))) {
      problems.push({ kind: "missingImage", page: page.slug, path });
    }
  }
  // The website renders Markdown, not HTML: anything but a key cap is either a
  // mistake or an injection, and a `<` in prose is not a tag because no letter
  // follows it.
  const tags: string[] = [];
  for (const name of captures(/<\/?([A-Za-z][A-Za-z0-9]*)/g, text)) {
    const tag = name.toLowerCase();
    if (tag === "kbd" || tags.includes(tag)) continue;
    tags.push(tag);
    problems.push({ kind: "forbiddenHTML", page: page.slug, snippet: `<${tag}` });
  }
  if (/javascript:/i.test(text)) {
    problems.push({ kind: "forbiddenHTML", page: page.slug, snippet: "javascript:" });
  }
  return problems;
}

/** Frontmatter is the lines between the first two `---` lines, each `key: value`. */
function splitFrontmatter(text: string): { front: Map<string, string>; body: string } {
  const lines = text.split("\n");
  const end = lines.indexOf("---", 1);
  if (lines[0] !== "---" || end === -1) return { front: new Map(), body: text };
  const front = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    const colon = line.indexOf(": ");
    if (colon === -1) continue;
    front.set(line.slice(0, colon), line.slice(colon + 2));
  }
  return { front, body: lines.slice(end + 1).join("\n") };
}

function captures(pattern: RegExp, text: string): string[] {
  return Array.from(text.matchAll(pattern), (match) => match[1]);
}

function isRelative(target: string): boolean {
  return !target.startsWith("/") && !target.startsWith("#") && !target.includes(":");
}

/** Resolves `path` against a page's folder; `null` when it climbs out of the guide root. */
function resolve(path: string, folder: string[]): string | null {
  const parts = [...folder];
  for (const part of path.split("/").filter((piece) => piece !== "")) {
    if (part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function orphans(root: string, listed: Set<string>): GuideProblem[] {
  const found: string[] = [];
  const walk = (relative: string) => {
    for (const name of readdirSync(join(root, relative))) {
      const child = relative === "" ? name : `${relative}/${name}`;
      const stats = statSync(join(root, child));
      if (stats.isDirectory()) walk(child);
      else if (stats.isFile() && child.endsWith(".md")) {
        const slug = child.slice(0, -3);
        if (!listed.has(slug)) found.push(slug);
      }
    }
  };
  walk("");
  return found.sort().map((slug) => ({ kind: "orphan", slug }));
}
