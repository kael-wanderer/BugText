import type MarkdownIt from "markdown-it";

export const CALLOUT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;

/** Convert marked quotes before markdown-it parses their inline content. */
export function installCallouts(md: MarkdownIt): void {
  md.core.ruler.after("block", "callouts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open" || tokens[i + 1].type !== "paragraph_open" || tokens[i + 2].type !== "inline") continue;
      const inline = tokens[i + 2];
      const [first, ...body] = inline.content.split("\n");
      const marker = /^\[!(note|tip|important|warning|caution)\][ \t]*(.*)$/i.exec(first);
      if (!marker) continue;
      const type = marker[1].toLowerCase();
      tokens[i].attrJoin("class", `callout callout-${type}`);
      inline.content = body.join("\n");
      if (!inline.content) tokens.splice(i + 1, 3);
      const open = new state.Token("paragraph_open", "p", 1);
      open.block = true;
      open.attrSet("class", "callout-title");
      const title = new state.Token("inline", "", 0);
      title.content = marker[2] || type[0].toUpperCase() + type.slice(1);
      title.children = [];
      const close = new state.Token("paragraph_close", "p", -1);
      close.block = true;
      tokens.splice(i + 1, 0, open, title, close);
    }
  });
}
