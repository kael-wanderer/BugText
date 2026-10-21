import { describe, expect, it } from "vitest";
import { buildIndex, retrieve, retrieveScored } from "../ai/retrieval";

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
