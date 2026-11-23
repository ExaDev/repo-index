import type { Repo } from "./types.ts";

/** Milliseconds in a day. */
export const MS_PER_DAY = 86_400_000;

/** The windows commit counts are fetched for, in days. */
const WEEK = 7;
const MONTH = 30;
const QUARTER = 90;
const YEAR = 365;
export const WINDOW_DAYS = [WEEK, MONTH, QUARTER, YEAR] as const;

/** Default half-life, in days, of a commit's contribution to a repository's activity. */
export const DEFAULT_HALF_LIFE_DAYS = 30;

/** Ages, in days, taken to represent each marginal bucket (the commits newer than a window but older than the previous one): the middle of the bucket. */
const BUCKET_MIDPOINTS_DAYS = WINDOW_DAYS.map(
  (days, index) => ((WINDOW_DAYS[index - 1] ?? 0) + days) / 2,
);

const HALF = 0.5;

/**
 * How active a repository is: each marginal bucket (0 to 7, 7 to 30, 30 to 90 and 90 to 365 days) contributes the base-2 logarithm of one plus its commit count, so volume counts with diminishing returns, times a weight that halves every `halfLifeDays` of the bucket's midpoint age, so recent activity counts for more. Commit counts are only known per window. A repository with no commits in the last year scores 0, so the tail of the list falls back to its tie-break order.
 */
export function activityScore(repo: Repo, halfLifeDays: number): number {
  const { last7, last30, last90, last365 } = repo.commits;
  const marginal = [
    last7,
    last30 - last7,
    last90 - last30,
    last365 - last90,
  ].map((n) => Math.max(0, n));
  return marginal.reduce(
    (sum, count, index) =>
      sum +
      Math.log2(1 + count) *
        HALF ** ((BUCKET_MIDPOINTS_DAYS[index] ?? 0) / halfLifeDays),
    0,
  );
}

/** Orders by activity score, highest first, then by most recent push, then by name. */
export function compareByActivity(
  halfLifeDays: number,
): (a: Repo, b: Repo) => number {
  return (a, b) =>
    activityScore(b, halfLifeDays) - activityScore(a, halfLifeDays) ||
    (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "") ||
    a.name.localeCompare(b.name);
}
