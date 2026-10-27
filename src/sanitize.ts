import DOMPurify from "dompurify";

// Raw HTML in Markdown stays supported, but anything that can run script,
// submit, embed another document or restyle the app is removed.
const FORBID_TAGS = [
  "script", "style", "iframe", "frame", "object", "embed", "base", "link",
  "meta", "form", "input", "button", "textarea", "select",
];

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR: ["srcdoc", "formaction"],
    ALLOW_DATA_ATTR: false,
  });
}
