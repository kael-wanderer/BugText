// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanPage } from "../import/clean";

const BASE = "https://e.com/docs/page";

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
}

describe("cleanPage", () => {
  it("removes page chrome", () => {
    const { html } = cleanPage(
      "<header>H</header><nav>N</nav><div><p>Body</p></div><aside>A</aside><footer>F</footer>",
      BASE,
    );
    const text = parse(html).body.textContent ?? "";
    expect(text).toContain("Body");
    for (const word of ["H", "N", "A", "F"]) expect(text).not.toContain(word);
  });

  it("removes active content", () => {
    const { html } = cleanPage(
      `<script>alert(1)</script><style>p{}</style><iframe src="https://e.com"></iframe><form><input></form>` +
        `<object data="x"></object><svg><circle/></svg><meta http-equiv="refresh" content="0;url=https://e.com">` +
        `<base href="https://evil.example/"><img src="https://e.com/a.png" onerror="alert(1)" srcset="x 2x" alt="pic">` +
        `<p onclick="x()" style="color:red" data-x="1">t</p>`,
      BASE,
    );
    const doc = parse(html);
    for (const tag of ["script", "style", "iframe", "form", "object", "svg", "meta", "base"]) {
      expect(doc.querySelector(tag), tag).toBeNull();
    }
    for (const element of Array.from(doc.body.querySelectorAll("*"))) {
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.name.startsWith("on")).toBe(false);
        expect(["style", "srcset"]).not.toContain(attribute.name);
        expect(attribute.name.startsWith("data-")).toBe(false);
      }
    }
    const img = doc.querySelector("img")!;
    expect(img.getAttributeNames().sort()).toEqual(["alt", "src"]);
  });

  it("runs and loads nothing", async () => {
    const flag = window as unknown as { __ran: boolean };
    flag.__ran = false;
    cleanPage(`<img src=x onerror="window.__ran=true"><script>window.__ran=true</script>`, BASE);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flag.__ran).toBe(false);
  });

  it("resolves and filters links", () => {
    const { html } = cleanPage(
      `<a href="../x">a</a> <a href="javascript:alert(1)">j</a> <a href="data:text/html,x">d</a> <a href="mailto:a@b.c">m</a> <a href="http://[bad">b</a>`,
      BASE,
    );
    const doc = parse(html);
    const links = Array.from(doc.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toEqual(["https://e.com/x", "mailto:a@b.c"]);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("j");
    expect(text).toContain("d");
    expect(text).toContain("b");
  });

  it("keeps https images only and counts them", () => {
    const result = cleanPage(
      `<img src="/a.png"><img src="http://e.com/b.png"><img src="data:image/png;base64,AAAA"><img src="https://c.com/c.png">`,
      BASE,
    );
    const sources = Array.from(parse(result.html).querySelectorAll("img")).map((img) => img.getAttribute("src"));
    expect(sources).toEqual(["https://e.com/a.png", "https://c.com/c.png"]);
    expect(result.webImages).toBe(2);
  });

  it("ignores a base tag when resolving", () => {
    const { html } = cleanPage(`<base href="https://evil.example/"><a href="x">x</a>`, BASE);
    expect(parse(html).querySelector("a")!.getAttribute("href")).toBe("https://e.com/docs/x");
  });

  it("prefers one main or one article", () => {
    const main = cleanPage(`<div>Outside</div><main><p>Inside</p></main>`, BASE).html;
    expect(main).toContain("Inside");
    expect(main).not.toContain("Outside");
    const article = cleanPage(`<div>Outside</div><article><p>Inside</p></article>`, BASE).html;
    expect(article).not.toContain("Outside");
    const two = cleanPage(`<div>Outside</div><article>One</article><article>Two</article>`, BASE).html;
    expect(two).toContain("Outside");
    expect(two).toContain("One");
    expect(two).toContain("Two");
  });

  it("removes hidden elements and comments", () => {
    const { html } = cleanPage(
      `<p hidden>H1</p><div aria-hidden="true">H2</div><div aria-hidden="false">Shown</div><!-- secret -->`,
      BASE,
    );
    expect(html).not.toContain("H1");
    expect(html).not.toContain("H2");
    expect(html).not.toContain("secret");
    expect(html).toContain("Shown");
  });

  it("takes the title from title, then h1, cut to 120 characters", () => {
    expect(cleanPage(`<title> A   page </title><p>x</p>`, BASE).title).toBe("A page");
    expect(cleanPage(`<h1>Heading  one</h1>`, BASE).title).toBe("Heading one");
    expect(cleanPage(`<p>x</p>`, BASE).title).toBe("");
    expect(cleanPage(`<title>${"a".repeat(200)}</title>`, BASE).title).toHaveLength(120);
  });

  it("flattens a table whose cells hold blocks, so Pandoc does not drop it", () => {
    const { html } = cleanPage(
      `<table><caption>Info</caption><tr><th>Name</th><td><p>One</p><ul><li>two</li></ul></td></tr>` +
        `<tr><td colspan="2"><div><img src="https://e.com/a.png" alt="logo"></div></td></tr></table>` +
        `<table><tr><th>h</th></tr><tr><td>plain <b>x</b></td></tr></table>`,
      BASE,
    );
    const doc = parse(html);
    expect(doc.querySelectorAll("table")).toHaveLength(1);
    expect(doc.querySelector("table")!.textContent).toContain("plain");
    const text = doc.body.textContent ?? "";
    for (const word of ["Info", "Name", "One", "two"]) expect(text).toContain(word);
    expect(doc.querySelector("img")!.getAttribute("src")).toBe("https://e.com/a.png");
  });

  it("flattens a table that holds a table, keeping a simple inner table", () => {
    const { html } = cleanPage(
      `<table><tr><td><table><tr><td><p>deep</p></td></tr></table><table><tr><td>inner</td></tr></table></td></tr></table>`,
      BASE,
    );
    const doc = parse(html);
    expect(doc.querySelectorAll("table table")).toHaveLength(0);
    expect(doc.querySelectorAll("table")).toHaveLength(1);
    expect(doc.querySelector("table")!.textContent).toBe("inner");
    expect(doc.body.textContent).toContain("deep");
  });
});
