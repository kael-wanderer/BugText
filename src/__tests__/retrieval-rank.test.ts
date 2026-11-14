import { describe, expect, it } from "vitest";
import { buildIndex, retrieve, retrieveScored, tokenize } from "../ai/retrieval";

const chunks = [
  { path: "/a.md", heading: "Auth", text: "login uses okta saml single sign on" },
  { path: "/b.md", heading: "Email", text: "smtp settings for outbound email relay" },
  { path: "/c.md", heading: "Okta", text: "okta okta okta provisioning and scim" },
];

describe("retrieve (BM25)", () => {
  it("returns each hit's actual retrieval score", () => {
    const index = buildIndex([
      { path: "/a.md", heading: "", text: "okta provisioning okta" },
      { path: "/b.md", heading: "", text: "okta" },
    ]);
    const hits = retrieveScored(index, "okta", 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(hits[0].chunk.path).toBe(retrieve(index, "okta", 2)[0].path);
    expect(hits[0].score).not.toBe(1);
  });

  it("ranks the most relevant chunk first", () => {
    const index = buildIndex(chunks);
    const hits = retrieve(index, "okta provisioning", 3);
    expect(hits[0].path).toBe("/c.md");
  });

  it("returns at most k hits with positive score only", () => {
    const index = buildIndex(chunks);
    const hits = retrieve(index, "okta", 1);
    expect(hits).toHaveLength(1);
    expect(retrieve(index, "nonexistentterm", 5)).toEqual([]);
  });

  it("excludes the active document path", () => {
    const index = buildIndex(chunks);
    const hits = retrieve(index, "okta", 5, "/c.md");
    expect(hits.some((hit) => hit.path === "/c.md")).toBe(false);
    expect(hits[0].path).toBe("/a.md");
  });

  it("handles an empty index", () => {
    expect(retrieve(buildIndex([]), "anything", 5)).toEqual([]);
  });
});

describe("tokenize", () => {
  it("keeps Vietnamese words whole and adds a form without diacritics", () => {
    expect(tokenize("Tiếng Việt")).toEqual(["tiếng", "tieng", "việt", "viet"]);
  });
  it("does not repeat a token that has no diacritics", () => {
    expect(tokenize("sync model v2")).toEqual(["sync", "model", "v2"]);
  });
  it("treats composed and decomposed accents the same", () => {
    expect(tokenize("tiếng".normalize("NFD"))).toEqual(tokenize("tiếng".normalize("NFC")));
  });
  it("folds đ to d", () => {
    expect(tokenize("đường")).toEqual(["đường", "duong"]);
  });
  it("returns nothing for text without letters or digits", () => {
    expect(tokenize(" — … !! ")).toEqual([]);
  });
});

it("finds a Vietnamese note from a query typed without accents", () => {
  const index = buildIndex([
    { path: "a.md", heading: "", text: "Tài liệu thiết kế đồng bộ" },
    { path: "b.md", heading: "", text: "Meeting notes about export" },
  ]);
  expect(retrieve(index, "thiet ke dong bo", 1)[0].path).toBe("a.md");
  expect(retrieve(index, "thiết kế", 1)[0].path).toBe("a.md");
  expect(retrieve(index, "…", 1)).toEqual([]);
});
