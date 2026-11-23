import assert from "node:assert/strict";
import { test } from "node:test";
import { activityScore, compareByActivity } from "./activity.ts";
import { repo } from "./fixtures.ts";
import type { CommitWindows } from "./types.ts";

const HALF_LIFE = 30;
const LONG_HALF_LIFE = 90;
const SHORT_HALF_LIFE = 7;
/** The age taken to represent the 7 to 30 day bucket. */
const MIDPOINT_OF_SECOND_BUCKET = 18.5;
const TOLERANCE = 1e-9;
const HALF = 0.5;

const windows = (commits: Partial<CommitWindows>): CommitWindows => ({
  last7: 0,
  last30: 0,
  last90: 0,
  last365: 0,
  ...commits,
});

test("a repository with no commits in the last year scores zero", () => {
  assert.equal(activityScore(repo("a"), HALF_LIFE), 0);
});

test("recent commits outweigh the same number of older ones", () => {
  const recent = repo("a", {
    commits: windows({ last7: 5, last30: 5, last90: 5, last365: 5 }),
  });
  const old = repo("b", { commits: windows({ last365: 5 }) });
  assert.ok(activityScore(recent, HALF_LIFE) > activityScore(old, HALF_LIFE));
});

test("a commit's weight halves each half-life", () => {
  const atMidpoint = repo("a", {
    commits: windows({ last30: 1, last90: 1, last365: 1 }),
  });
  // the 7 to 30 day bucket is represented at 18.5 days
  assert.ok(
    Math.abs(activityScore(atMidpoint, MIDPOINT_OF_SECOND_BUCKET) - HALF) <
      TOLERANCE,
  );
});

test("a shorter half-life tails off faster", () => {
  const old = repo("a", { commits: windows({ last90: 4, last365: 4 }) });
  assert.ok(
    activityScore(old, SHORT_HALF_LIFE) < activityScore(old, LONG_HALF_LIFE),
  );
});

test("a busy older repository can still rank above a barely active recent one", () => {
  const busyOlder = repo("busy", {
    commits: windows({ last30: 200, last90: 400, last365: 800 }),
  });
  const trickle = repo("trickle", {
    commits: windows({ last7: 1, last30: 1, last90: 1, last365: 1 }),
  });
  const sorted = [trickle, busyOlder].sort(compareByActivity(HALF_LIFE));
  assert.deepEqual(
    sorted.map((r) => r.name),
    ["busy", "trickle"],
  );
});

test("ties fall back to the latest push, then the name", () => {
  const sorted = [
    repo("b", { pushedAt: "2026-01-01T00:00:00Z" }),
    repo("a", { pushedAt: "2026-01-01T00:00:00Z" }),
    repo("c", { pushedAt: "2026-06-01T00:00:00Z" }),
  ].sort(compareByActivity(HALF_LIFE));
  assert.deepEqual(
    sorted.map((r) => r.name),
    ["c", "a", "b"],
  );
});

test("window counts that shrink are clamped, never scored negatively", () => {
  const odd = repo("a", {
    commits: windows({ last7: 3, last30: 1, last90: 1, last365: 1 }),
  });
  assert.ok(activityScore(odd, HALF_LIFE) >= 0);
});

const BIG_OLD_PILE = 500;
const BIG_RECENT_BURST = 200;

test("a large old pile of commits does not outrank one commit from yesterday", () => {
  const oldPile = repo("old", {
    commits: windows({ last365: BIG_OLD_PILE }),
  });
  const yesterday = repo("new", {
    commits: windows({ last7: 1, last30: 1, last90: 1, last365: 1 }),
  });
  assert.ok(
    activityScore(yesterday, HALF_LIFE) > activityScore(oldPile, HALF_LIFE),
  );
});

test("a large recent burst still outranks one commit from yesterday", () => {
  const burst = repo("burst", {
    commits: windows({
      last30: BIG_RECENT_BURST,
      last90: BIG_RECENT_BURST,
      last365: BIG_RECENT_BURST,
    }),
  });
  const yesterday = repo("new", {
    commits: windows({ last7: 1, last30: 1, last90: 1, last365: 1 }),
  });
  assert.ok(
    activityScore(burst, HALF_LIFE) > activityScore(yesterday, HALF_LIFE),
  );
});

test("each extra commit in a bucket adds less than the one before", () => {
  const score = (n: number): number =>
    activityScore(
      repo("a", {
        commits: windows({ last7: n, last30: n, last90: n, last365: n }),
      }),
      HALF_LIFE,
    );
  const ONE = 1;
  const TWO = 2;
  const THREE = 3;
  assert.ok(score(TWO) - score(ONE) > score(THREE) - score(TWO));
});
