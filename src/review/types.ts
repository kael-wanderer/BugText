// Shapes of the review snapshot Rust returns. Rust alone decides state.
export type ReviewRoute = "cli" | "mcp" | "outside";
export type ReviewState = "changed" | "new" | "later";
export type ReviewAction = "reviewed" | "later" | "dismiss" | "restore";
export type ReviewItem = {
  path: string; state: ReviewState; digest: string; changedAt: number; route: ReviewRoute;
  reviewedAt: number | null; baseline: boolean; hasText: boolean; added: number | null; removed: number | null;
};
export type ReviewSnapshot = { folder: string; tracked: number; startedAt: number; items: ReviewItem[] };

export const REVIEW_ERROR = "Review data could not be read";
export const REVIEW_EVENT = "bugtext://review-changed";
